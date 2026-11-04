import { z } from 'zod';
import type { AgentCheck } from '../../../shared/contracts/agent-tasks.ts';
import type { ReviewThread } from '../../../shared/contracts/pull-request-reviews.ts';
import type {
  GitProvider,
  ProviderChangedFile,
  ProviderCommit,
  ProviderCommitChanges,
  ProviderPullRequest,
  ProviderPublishedReview,
  ProviderPullRequestDetails,
  ProviderPullRequestRefs,
  ProviderReview,
  MergeMethod,
  ReviewVerdict,
  ProviderRepository,
} from '../types.ts';
import type { GitHubClient } from './client.ts';
import { parseHunks } from './patch.ts';

const repositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  name: z.string(),
  owner: z.object({ login: z.string() }),
  default_branch: z.string(),
  private: z.boolean(),
  archived: z.boolean(),
  permissions: z.object({ push: z.boolean() }).optional(),
});

const pullRequestSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  draft: z.boolean().optional(),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  user: z
    .object({ login: z.string(), avatar_url: z.string(), type: z.string().optional() })
    .nullable(),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
    // null when the fork behind the pull request was deleted.
    repo: z.object({ id: z.number() }).nullable(),
  }),
  base: z.object({ ref: z.string(), repo: z.object({ id: z.number() }) }),
});

const changedFileSchema = z.object({
  filename: z.string(),
  sha: z.string(),
  previous_filename: z.string().optional(),
  status: z.enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']),
  additions: z.number(),
  deletions: z.number(),
  // Left out for files too large or binary for GitHub to diff.
  patch: z.string().optional(),
});

const commitSchema = z.object({
  sha: z.string(),
  commit: z.object({ message: z.string() }),
  author: z.object({ login: z.string() }).nullable(),
});

// GitHub's answer to a new review. Only its id is used.
const postedReviewSchema = z.object({ id: z.number() });

const reviewSchema = z.object({
  id: z.number(),
  body: z.string().nullable(),
});

const commitChangesSchema = z.object({
  parents: z.array(z.object({ sha: z.string() })),
  files: z.array(changedFileSchema).optional(),
});

const pullRequestRefsSchema = z.object({
  head: z.object({ sha: z.string() }),
  base: z.object({ ref: z.string() }),
});

const pullRequestBodySchema = z.object({ body: z.string().nullable() });

const comparedFilesSchema = z.object({ files: z.array(changedFileSchema).optional() });

const treeSchema = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string() })),
  truncated: z.boolean(),
});

const comparisonSchema = z.object({ merge_base_commit: z.object({ sha: z.string() }) });

function toChangedFile(file: z.infer<typeof changedFileSchema>): ProviderChangedFile {
  return {
    path: file.filename,
    blobSha: file.sha,
    previousPath: file.previous_filename ?? null,
    // A file GitHub calls unchanged has no diff to show, same as a plain edit.
    status: file.status === 'unchanged' ? 'changed' : file.status,
    additions: file.additions,
    deletions: file.deletions,
    hunks: file.patch === undefined ? null : parseHunks(file.patch),
  };
}

const CHECKS_QUERY = `
  query ($owner: String!, $name: String!, $number: Int!, $sha: GitObjectID!) {
    repository(owner: $owner, name: $name) {
      object(oid: $sha) {
        ... on Commit {
          statusCheckRollup {
            contexts(first: 100) {
              nodes {
                __typename
                ... on CheckRun {
                  name
                  status
                  conclusion
                  detailsUrl
                  isRequired(pullRequestNumber: $number)
                }
                ... on StatusContext {
                  context
                  state
                  targetUrl
                  isRequired(pullRequestNumber: $number)
                }
              }
            }
          }
        }
      }
    }
  }
`;

const checksSchema = z.object({
  repository: z.object({
    object: z
      .object({
        statusCheckRollup: z
          .object({
            contexts: z.object({
              nodes: z.array(
                z.union([
                  z.object({
                    __typename: z.literal('CheckRun'),
                    name: z.string(),
                    status: z.string(),
                    conclusion: z.string().nullable(),
                    detailsUrl: z.string().nullable(),
                    isRequired: z.boolean(),
                  }),
                  z.object({
                    __typename: z.literal('StatusContext'),
                    context: z.string(),
                    state: z.string(),
                    targetUrl: z.string().nullable(),
                    isRequired: z.boolean(),
                  }),
                ]),
              ),
            }),
          })
          .nullable()
          .optional(),
      })
      .nullable(),
  }),
});

// GitHub's check run conclusions and commit status states, as pass, fail, pending or skip.
function checkState(done: boolean, result: string | null): AgentCheck['state'] {
  if (!done || result === 'PENDING' || result === 'EXPECTED') return 'pending';
  if (result === 'SUCCESS') return 'passed';
  if (result === 'NEUTRAL' || result === 'SKIPPED') return 'skipped';
  return 'failed';
}

const REVIEW_THREADS_QUERY = `
  query ($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            path
            diffSide
            startLine
            line
            isResolved
            isOutdated
            comments(first: 100) {
              nodes { id body createdAt url author { login avatarUrl } }
            }
          }
        }
      }
    }
  }
`;

const reviewThreadsSchema = z.object({
  repository: z.object({
    pullRequest: z.object({
      reviewThreads: z.object({
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
        nodes: z.array(
          z.object({
            id: z.string(),
            path: z.string(),
            diffSide: z.enum(['LEFT', 'RIGHT']),
            startLine: z.number().nullable(),
            line: z.number().nullable(),
            isResolved: z.boolean(),
            isOutdated: z.boolean(),
            comments: z.object({
              nodes: z.array(
                z.object({
                  id: z.string(),
                  body: z.string(),
                  createdAt: z.string(),
                  url: z.string(),
                  author: z.object({ login: z.string(), avatarUrl: z.string() }).nullable(),
                }),
              ),
            }),
          }),
        ),
      }),
    }),
  }),
});

const REPLY_MUTATION = `
  mutation ($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
      comment { id }
    }
  }
`;

const RESOLVE_MUTATION = `
  mutation ($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) { thread { id } }
  }
`;

const UNRESOLVE_MUTATION = `
  mutation ($threadId: ID!) {
    unresolveReviewThread(input: { threadId: $threadId }) { thread { id } }
  }
`;

// Stops a runaway listing, like the REST client's page limit.
const MAX_THREAD_PAGES = 20;

const reviewEvents: Record<ReviewVerdict, string> = {
  approve: 'APPROVE',
  'request-changes': 'REQUEST_CHANGES',
  comment: 'COMMENT',
};

function encodeContentPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export class GitHubProvider implements GitProvider {
  constructor(private readonly client: GitHubClient) {}

  // The repository as the token's account sees it. Rejects with a 404 when the account
  // can't read it.
  async getRepository(repositoryFullName: string): Promise<ProviderRepository> {
    const repository = repositorySchema.parse(
      await this.client.getJson(`/repos/${repositoryFullName}`),
    );
    return {
      provider: 'github',
      providerId: String(repository.id),
      fullName: repository.full_name,
      owner: repository.owner.login,
      name: repository.name,
      defaultBranch: repository.default_branch,
      private: repository.private,
      archived: repository.archived,
      canPush: repository.permissions?.push ?? false,
    };
  }

  async getPullRequests(repositoryFullName: string): Promise<ProviderPullRequest[]> {
    const items = await this.client.getAll(`/repos/${repositoryFullName}/pulls`, {
      state: 'open',
      sort: 'updated',
      direction: 'desc',
    });
    return items
      .map((item) => pullRequestSchema.parse(item))
      .filter((pull) => pull.head.repo?.id === pull.base.repo.id)
      .map((pull) => ({
        provider: 'github',
        providerId: String(pull.id),
        number: pull.number,
        title: pull.title,
        draft: pull.draft ?? false,
        url: pull.html_url,
        author: pull.user && {
          login: pull.user.login,
          avatarUrl: pull.user.avatar_url,
          bot: pull.user.type === 'Bot',
        },
        headBranch: pull.head.ref,
        headSha: pull.head.sha,
        baseBranch: pull.base.ref,
        createdAt: pull.created_at,
        updatedAt: pull.updated_at,
      }));
  }

  async getPullRequestRefs(
    repositoryFullName: string,
    number: number,
  ): Promise<ProviderPullRequestRefs> {
    const pull = pullRequestRefsSchema.parse(
      await this.client.getJson(`/repos/${repositoryFullName}/pulls/${number}`),
    );
    return { headSha: pull.head.sha, baseBranch: pull.base.ref };
  }

  async getPullRequestFiles(
    repositoryFullName: string,
    number: number,
  ): Promise<ProviderChangedFile[]> {
    const items = await this.client.getAll(`/repos/${repositoryFullName}/pulls/${number}/files`);
    return items.map((item) => toChangedFile(changedFileSchema.parse(item)));
  }

  async getPullRequestCommits(
    repositoryFullName: string,
    number: number,
  ): Promise<ProviderCommit[]> {
    const items = await this.client.getAll(`/repos/${repositoryFullName}/pulls/${number}/commits`);
    return items.map((item) => {
      const commit = commitSchema.parse(item);
      return {
        sha: commit.sha,
        // The first line is the subject.
        subject: commit.commit.message.split('\n')[0] ?? '',
        authorLogin: commit.author?.login ?? null,
      };
    });
  }

  async getCommitChanges(repositoryFullName: string, sha: string): Promise<ProviderCommitChanges> {
    const commit = commitChangesSchema.parse(
      await this.client.getJson(`/repos/${repositoryFullName}/commits/${sha}`),
    );
    const parent = commit.parents[0];
    if (!parent) throw new Error('This commit has no parent to compare with.');
    return { parentSha: parent.sha, files: (commit.files ?? []).map(toChangedFile) };
  }

  async getChangesBetween(
    repositoryFullName: string,
    baseSha: string,
    headSha: string,
  ): Promise<ProviderChangedFile[]> {
    const comparison = comparedFilesSchema.parse(
      await this.client.getJson(`/repos/${repositoryFullName}/compare/${baseSha}...${headSha}`),
    );
    return (comparison.files ?? []).map(toChangedFile);
  }

  async getRepositoryFiles(
    repositoryFullName: string,
    ref: string,
  ): Promise<{ paths: string[]; truncated: boolean }> {
    const { tree, truncated } = treeSchema.parse(
      await this.client.getJson(`/repos/${repositoryFullName}/git/trees/${ref}`, {
        recursive: '1',
      }),
    );
    return { paths: tree.filter((entry) => entry.type === 'blob').map((e) => e.path), truncated };
  }

  async getMergeBase(
    repositoryFullName: string,
    baseBranch: string,
    headSha: string,
  ): Promise<string> {
    const comparison = await this.client.getJson(
      `/repos/${repositoryFullName}/compare/${encodeURIComponent(baseBranch)}...${headSha}`,
      { per_page: '1' },
    );
    return comparisonSchema.parse(comparison).merge_base_commit.sha;
  }

  getFileContent(
    repositoryFullName: string,
    path: string,
    ref: string,
  ): Promise<string | undefined> {
    return this.client.getText(`/repos/${repositoryFullName}/contents/${encodeContentPath(path)}`, {
      ref,
    });
  }

  getFileBytes(
    repositoryFullName: string,
    path: string,
    ref: string,
  ): Promise<Uint8Array | undefined> {
    return this.client.getBytes(
      `/repos/${repositoryFullName}/contents/${encodeContentPath(path)}`,
      {
        ref,
      },
    );
  }

  // Threads come from GraphQL, because the REST API doesn't say whether a thread is resolved.
  // A thread shows its first 100 comments.
  async getReviewThreads(repositoryFullName: string, number: number): Promise<ReviewThread[]> {
    const [owner, name] = repositoryFullName.split('/');
    const threads: ReviewThread[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_THREAD_PAGES; page++) {
      const data = reviewThreadsSchema.parse(
        await this.client.graphql(REVIEW_THREADS_QUERY, { owner, name, number, cursor }),
      );
      const { pageInfo, nodes } = data.repository.pullRequest.reviewThreads;
      for (const thread of nodes) {
        threads.push({
          id: thread.id,
          path: thread.path,
          side: thread.diffSide === 'LEFT' ? 'original' : 'modified',
          startLine: thread.startLine,
          line: thread.line,
          resolved: thread.isResolved,
          outdated: thread.isOutdated,
          comments: thread.comments.nodes,
        });
      }
      if (!pageInfo.hasNextPage) break;
      cursor = pageInfo.endCursor;
    }
    return threads;
  }

  async getChecks(repositoryFullName: string, number: number, sha: string): Promise<AgentCheck[]> {
    const [owner, name] = repositoryFullName.split('/');
    const data = checksSchema.parse(
      await this.client.graphql(CHECKS_QUERY, { owner, name, number, sha }),
    );
    const nodes = data.repository.object?.statusCheckRollup?.contexts.nodes ?? [];
    return nodes.map((node) =>
      node.__typename === 'CheckRun'
        ? {
            name: node.name,
            required: node.isRequired,
            state: checkState(node.status === 'COMPLETED', node.conclusion),
            url: node.detailsUrl,
          }
        : {
            name: node.context,
            required: node.isRequired,
            state: checkState(true, node.state),
            url: node.targetUrl,
          },
    );
  }

  // The thread id alone names the thread. The repository picks the account.
  async replyToThread(_repositoryFullName: string, threadId: string, body: string): Promise<void> {
    await this.client.graphql(REPLY_MUTATION, { threadId, body });
  }

  async setThreadResolved(
    _repositoryFullName: string,
    threadId: string,
    resolved: boolean,
  ): Promise<void> {
    await this.client.graphql(resolved ? RESOLVE_MUTATION : UNRESOLVE_MUTATION, { threadId });
  }

  async submitReview(
    repositoryFullName: string,
    number: number,
    review: ProviderReview,
  ): Promise<{ id: string }> {
    const posted = await this.client.postJson(
      `/repos/${repositoryFullName}/pulls/${number}/reviews`,
      {
        commit_id: review.headSha,
        body: review.body,
        event: reviewEvents[review.verdict],
        comments: review.comments.map((comment) => {
          const side = comment.side === 'original' ? 'LEFT' : 'RIGHT';
          return {
            path: comment.path,
            body: comment.body,
            line: comment.line,
            side,
            ...(comment.startLine !== null && { start_line: comment.startLine, start_side: side }),
          };
        }),
      },
    );
    return { id: String(postedReviewSchema.parse(posted).id) };
  }

  async getPullRequestDetails(
    repositoryFullName: string,
    number: number,
  ): Promise<ProviderPullRequestDetails> {
    const [pull, items] = await Promise.all([
      this.client.getJson(`/repos/${repositoryFullName}/pulls/${number}`),
      this.client.getAll(`/repos/${repositoryFullName}/pulls/${number}/files`),
    ]);
    return {
      description: pullRequestBodySchema.parse(pull).body ?? '',
      files: items.map((item) => {
        const file = changedFileSchema.parse(item);
        const { path, previousPath, status, additions, deletions } = toChangedFile(file);
        return { path, previousPath, status, additions, deletions, patch: file.patch ?? null };
      }),
    };
  }

  async getReviews(repositoryFullName: string, number: number): Promise<ProviderPublishedReview[]> {
    const items = await this.client.getAll(`/repos/${repositoryFullName}/pulls/${number}/reviews`);
    return items.map((item) => {
      const review = reviewSchema.parse(item);
      return { id: String(review.id), body: review.body ?? '' };
    });
  }

  async mergePullRequest(
    repositoryFullName: string,
    number: number,
    headSha: string,
    method: MergeMethod,
  ): Promise<void> {
    await this.client.putJson(`/repos/${repositoryFullName}/pulls/${number}/merge`, {
      sha: headSha,
      merge_method: method,
    });
  }

  async deleteBranch(repositoryFullName: string, branch: string): Promise<void> {
    // The branch name keeps its slashes, because the ref is a path.
    const ref = branch.split('/').map(encodeURIComponent).join('/');
    await this.client.delete(`/repos/${repositoryFullName}/git/refs/heads/${ref}`);
  }
}
