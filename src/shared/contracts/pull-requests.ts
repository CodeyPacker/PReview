import { z } from 'zod';

// Where the reviewer is in a pull request, from what is stored on this machine. It doesn't
// include the GitHub state. Agents count only through CI on commits they pushed: pending
// keeps a review submitted, and failed needs the reviewer's action.
export const reviewStateSchema = z.enum([
  'needs-review',
  'in-progress',
  'draft-feedback',
  'feedback-submitted',
  'ready-for-rereview',
  'action-required',
  'completed',
]);
export type ReviewState = z.infer<typeof reviewStateSchema>;

export const pullRequestSchema = z.object({
  id: z.number().int(),
  repositoryId: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  draft: z.boolean(),
  url: z.string(),
  author: z.object({ login: z.string(), avatarUrl: z.string(), bot: z.boolean() }).nullable(),
  headBranch: z.string(),
  headSha: z.string(),
  baseBranch: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Whether its review has been opened in PReview.
  opened: z.boolean(),
  reviewState: reviewStateSchema,
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

// 'busy' when an agent is working or a review is being sent.
export const clearReviewDataResultSchema = z.object({ status: z.enum(['cleared', 'busy']) });
export type ClearReviewDataResult = z.infer<typeof clearReviewDataResultSchema>;
