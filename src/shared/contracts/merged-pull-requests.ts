import { z } from 'zod';

// What the reviewer did in a pull request, saved when it merged. The pull request itself is
// deleted from this machine once it closes.
export const mergedPullRequestSchema = z.object({
  pullRequestId: z.number().int(),
  repository: z.string(),
  number: z.number().int(),
  url: z.string(),
  mergedAt: z.string(),
  // Line comments, sent or still unsent.
  comments: z.number().int(),
  // Findings that are improvements or tests.
  suggestions: z.number().int(),
  // Findings that are bugs, UI bugs or security problems, minus the ones an agent rejected.
  bugsCaught: z.number().int(),
  // Files the reviewer approved or flagged.
  filesReviewed: z.number().int(),
});
export type MergedPullRequest = z.infer<typeof mergedPullRequestSchema>;
