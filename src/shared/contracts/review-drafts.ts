import { z } from 'zod';
import { commitShaSchema } from './pull-request-files.ts';
import { findingCategorySchema } from './review-findings.ts';

// original is the file before the pull request, modified the file after it.
export const diffSideSchema = z.enum(['original', 'modified']);
export type DiffSide = z.infer<typeof diffSideSchema>;

const draftBodySchema = z.string().trim().min(1).max(65_536);

// A comment on diff lines that has not been sent. It belongs to the commits of the diff it
// was written on.
export const reviewDraftSchema = z.object({
  id: z.number().int(),
  pullRequestId: z.number().int(),
  headSha: commitShaSchema,
  mergeBase: commitShaSchema,
  path: z.string(),
  side: diffSideSchema,
  // Set when the comment covers several lines. It runs from startLine to line.
  startLine: z.number().int().positive().nullable(),
  line: z.number().int().positive(),
  // True when newer commits changed these lines, so the comment can't be placed on them for
  // sure. It stays at its old line and is not sent.
  outdated: z.boolean(),
  body: z.string(),
  // The kind of problem the comment points out, as findings have. Null when the reviewer
  // gave none, and then it earns no XP.
  category: findingCategorySchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;

export const createReviewDraftInputSchema = z
  .object({
    pullRequestId: z.number().int(),
    headSha: commitShaSchema,
    mergeBase: commitShaSchema,
    path: z.string().min(1),
    side: diffSideSchema,
    startLine: z.number().int().positive().nullable(),
    line: z.number().int().positive(),
    body: draftBodySchema,
    // Left out for none.
    category: findingCategorySchema.nullable().optional(),
  })
  .refine((draft) => draft.startLine === null || draft.startLine < draft.line, {
    message: 'startLine must come before line.',
  });
export type CreateReviewDraftInput = z.infer<typeof createReviewDraftInputSchema>;

export const updateReviewDraftInputSchema = z.object({
  pullRequestId: z.number().int(),
  id: z.number().int(),
  body: draftBodySchema,
  // Left out to keep the one the draft has.
  category: findingCategorySchema.nullable().optional(),
});
export type UpdateReviewDraftInput = z.infer<typeof updateReviewDraftInputSchema>;

// The commits a pull request is now at, which its drafts from older commits are moved to.
export const reattachReviewDraftsInputSchema = z.object({
  pullRequestId: z.number().int(),
  headSha: commitShaSchema,
  mergeBase: commitShaSchema,
});
export type ReattachReviewDraftsInput = z.infer<typeof reattachReviewDraftsInputSchema>;
