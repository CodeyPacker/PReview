import { z } from 'zod';

export const pullRequestSchema = z.object({
  id: z.number().int(),
  repositoryId: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  draft: z.boolean(),
  url: z.string(),
  author: z.object({ login: z.string(), avatarUrl: z.string() }).nullable(),
  headBranch: z.string(),
  headSha: z.string(),
  baseBranch: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PullRequest = z.infer<typeof pullRequestSchema>;

export const pullRequestSyncErrorSchema = z.object({
  repositoryId: z.number().int(),
  message: z.string(),
});
export type PullRequestSyncError = z.infer<typeof pullRequestSyncErrorSchema>;

export const pullRequestsStateSchema = z.object({
  // Open pull requests of the monitored repositories.
  pullRequests: z.array(pullRequestSchema),
  // Repositories whose last sync failed. Their pull requests are from an earlier sync.
  errors: z.array(pullRequestSyncErrorSchema),
  syncing: z.boolean(),
});
export type PullRequestsState = z.infer<typeof pullRequestsStateSchema>;
