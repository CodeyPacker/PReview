import { z } from 'zod';
import type {
  GitProvider,
  ProviderChangedFile,
  ProviderPullRequest,
  ProviderPullRequestRefs,
  ProviderRepository,
} from '../types.ts';
import type { GitHubClient } from './client.ts';

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
});

const pullRequestRefsSchema = z.object({
  head: z.object({ sha: z.string() }),
  base: z.object({ ref: z.string() }),
});

const comparisonSchema = z.object({ merge_base_commit: z.object({ sha: z.string() }) });

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
}
