import { z } from 'zod';

export const diffModeSchema = z.enum(['split', 'unified']);
export type DiffMode = z.infer<typeof diffModeSchema>;

// Where the reviewer left off in a pull request, kept on this machine so the review opens
// there again after leaving it or restarting the app.
export const reviewSessionSchema = z.object({
  pullRequestId: z.number().int(),
  // Null until a file is shown.
  selectedPath: z.string().nullable(),
  // The selected file's scroll position in pixels.
  scrollTop: z.number().int().nonnegative(),
  diffMode: diffModeSchema,
});
export type ReviewSession = z.infer<typeof reviewSessionSchema>;

export const saveReviewSessionInputSchema = reviewSessionSchema;
export type SaveReviewSessionInput = z.infer<typeof saveReviewSessionInputSchema>;
