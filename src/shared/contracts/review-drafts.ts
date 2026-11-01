import { z } from 'zod';
import { commitShaSchema } from './pull-request-files.ts';

// original is the file before the pull request, modified the file after it.
export const diffSideSchema = z.enum(['original', 'modified']);
export type DiffSide = z.infer<typeof diffSideSchema>;

const draftBodySchema = z.string().trim().min(1).max(65_536);

// A comment on one diff line that has not been sent. It belongs to the commits of the diff it
// was written on.
export const reviewDraftSchema = z.object({
  id: z.number().int(),
  pullRequestId: z.number().int(),
  headSha: commitShaSchema,
  mergeBase: commitShaSchema,
  path: z.string(),
  side: diffSideSchema,
  line: z.number().int().positive(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;

export const createReviewDraftInputSchema = z.object({
  pullRequestId: z.number().int(),
  headSha: commitShaSchema,
  mergeBase: commitShaSchema,
  path: z.string().min(1),
  side: diffSideSchema,
  line: z.number().int().positive(),
  body: draftBodySchema,
});
export type CreateReviewDraftInput = z.infer<typeof createReviewDraftInputSchema>;

export const updateReviewDraftInputSchema = z.object({
  pullRequestId: z.number().int(),
  id: z.number().int(),
  body: draftBodySchema,
});
export type UpdateReviewDraftInput = z.infer<typeof updateReviewDraftInputSchema>;
