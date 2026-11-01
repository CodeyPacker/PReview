import { z } from 'zod';
import { commitShaSchema } from './pull-request-files.ts';

export const reviewVerdictSchema = z.enum(['approve', 'request-changes', 'comment']);
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;

export const submitReviewInputSchema = z.object({
  pullRequestId: z.number().int(),
  // The commit the reviewer was looking at.
  headSha: commitShaSchema,
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
