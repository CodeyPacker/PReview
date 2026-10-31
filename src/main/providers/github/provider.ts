import { z } from 'zod';
import type { GitProvider, ProviderPullRequest, ProviderRepository } from '../types.ts';
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
  user: z.object({ login: z.string(), avatar_url: z.string() }).nullable(),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
    // null when the fork behind the pull request was deleted.
    repo: z.object({ id: z.number() }).nullable(),
  }),
  base: z.object({ ref: z.string(), repo: z.object({ id: z.number() }) }),
});

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
        author: pull.user && { login: pull.user.login, avatarUrl: pull.user.avatar_url },
        headBranch: pull.head.ref,
        headSha: pull.head.sha,
        baseBranch: pull.base.ref,
        createdAt: pull.created_at,
        updatedAt: pull.updated_at,
      }));
  }
}
