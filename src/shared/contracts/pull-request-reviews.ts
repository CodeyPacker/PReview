import { z } from 'zod';
import { commitShaSchema } from './pull-request-files.ts';

export const reviewVerdictSchema = z.enum(['approve', 'request-changes', 'comment']);
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;

export const submitReviewInputSchema = z.object({
  pullRequestId: z.number().int(),
  // The commits of the diff the reviewer was looking at.
  headSha: commitShaSchema,
  mergeBase: commitShaSchema,
  // Drafts written on that diff to publish as line comments. Each must be inside a diff hunk.
  draftIds: z.array(z.number().int()),
  verdict: reviewVerdictSchema,
  body: z.string().max(65_536),
});
export type SubmitReviewInput = z.infer<typeof submitReviewInputSchema>;

// rejected: the provider refused the review. The message says why and is safe to show.
export const submitReviewResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('submitted') }),
  z.object({ status: z.literal('rejected'), message: z.string() }),
]);
export type SubmitReviewResult = z.infer<typeof submitReviewResultSchema>;

export const mergeMethodSchema = z.enum(['merge', 'squash', 'rebase']);
export type MergeMethod = z.infer<typeof mergeMethodSchema>;

export const mergePullRequestInputSchema = z.object({
  pullRequestId: z.number().int(),
  // The commit the reviewer looked at. The merge is refused if the branch has moved past it.
  headSha: commitShaSchema,
  method: mergeMethodSchema,
});
export type MergePullRequestInput = z.infer<typeof mergePullRequestInputSchema>;

// rejected: the provider refused the merge. The message says why and is safe to show.
export const mergePullRequestResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('merged') }),
  z.object({ status: z.literal('rejected'), message: z.string() }),
]);
export type MergePullRequestResult = z.infer<typeof mergePullRequestResultSchema>;
