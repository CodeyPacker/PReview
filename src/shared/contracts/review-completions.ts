import { z } from 'zod';

// A review the reviewer finished, kept on this machine. It doesn't depend on GitHub approval.
export const reviewCompletionSchema = z.object({
  completedAt: z.string(),
});
export type ReviewCompletion = z.infer<typeof reviewCompletionSchema>;
