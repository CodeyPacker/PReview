import { z } from 'zod';
import type { ReviewThread } from '../../../shared/contracts/pull-request-reviews.ts';
import type {
  GitProvider,
  ProviderChangedFile,
  ProviderPullRequest,
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
  previous_filename: z.string().optional(),
  status: z.enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']),
  additions: z.number(),
  deletions: z.number(),
  // Left out for files too large or binary for GitHub to diff.
  patch: z.string().optional(),
});

const pullRequestRefsSchema = z.object({
  head: z.object({ sha: z.string() }),
  base: z.object({ ref: z.string() }),
});

const comparisonSchema = z.object({ merge_base_commit: z.object({ sha: z.string() }) });

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

  async getRepositories(): Promise<ProviderRepository[]> {
    const items = await this.client.getAll('/user/repos', {
      affiliation: 'owner,collaborator,organization_member',
    });
    return items.map((item) => {
      const repository = repositorySchema.parse(item);
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
    });
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
    return items.map((item) => {
      const file = changedFileSchema.parse(item);
      return {
        path: file.filename,
        previousPath: file.previous_filename ?? null,
        // A file GitHub calls unchanged has no diff to show, same as a plain edit.
        status: file.status === 'unchanged' ? 'changed' : file.status,
        additions: file.additions,
        deletions: file.deletions,
        hunks: file.patch === undefined ? null : parseHunks(file.patch),
      };
    });
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

  async replyToThread(threadId: string, body: string): Promise<void> {
    await this.client.graphql(REPLY_MUTATION, { threadId, body });
  }

  async setThreadResolved(threadId: string, resolved: boolean): Promise<void> {
    await this.client.graphql(resolved ? RESOLVE_MUTATION : UNRESOLVE_MUTATION, { threadId });
  }

  async submitReview(
    repositoryFullName: string,
    number: number,
    review: ProviderReview,
  ): Promise<void> {
    await this.client.postJson(`/repos/${repositoryFullName}/pulls/${number}/reviews`, {
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
