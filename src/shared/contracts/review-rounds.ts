import { z } from 'zod';
import { commitShaSchema } from './pull-request-files.ts';

// One pass over a pull request, kept on this machine. A round ends when its review is
// submitted. The next new commit starts the following round.
export const reviewRoundSchema = z.object({
  number: z.number().int().positive(),
  // The head the round opened on.
  headSha: commitShaSchema,
  // The head the previous round was submitted at. Null in the first round.
  baselineSha: commitShaSchema.nullable(),
  startedAt: z.string(),
  submittedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type ReviewRound = z.infer<typeof reviewRoundSchema>;
