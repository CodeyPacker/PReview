import { z } from 'zod';

export const findingCategorySchema = z.enum(['bug', 'ui-bug', 'security', 'improvement', 'test']);
export type FindingCategory = z.infer<typeof findingCategorySchema>;

export const findingCategoryLabels = {
  bug: 'Bug',
  'ui-bug': 'UI bug',
  security: 'Security',
  improvement: 'Improvement',
  test: 'Test',
} satisfies Record<FindingCategory, string>;

// Whether the agent confirmed the problem. pending until an agent looks at it.
export const findingValidationSchema = z.enum(['pending', 'validated', 'rejected']);
export type FindingValidation = z.infer<typeof findingValidationSchema>;

// Whether the reviewer considers the problem fixed.
export const findingResolutionSchema = z.enum(['open', 'resolved']);
export type FindingResolution = z.infer<typeof findingResolutionSchema>;

const descriptionSchema = z.string().trim().min(1).max(16_384);
const stepsSchema = z.string().trim().max(16_384);

// A problem with the pull request that isn't tied to a code line. It stays on this machine
// until it is published with a review, and is kept after that to track its status.
export const reviewFindingSchema = z.object({
  id: z.number().int(),
  pullRequestId: z.number().int(),
  category: findingCategorySchema,
  description: z.string(),
  // Empty when there are none.
  steps: z.string(),
  validation: findingValidationSchema,
  resolution: findingResolutionSchema,
  // Null until it is published with a review. A published finding can't be edited or deleted.
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

export const createReviewFindingInputSchema = z.object({
  pullRequestId: z.number().int(),
  category: findingCategorySchema,
  description: descriptionSchema,
  steps: stepsSchema,
});
export type CreateReviewFindingInput = z.infer<typeof createReviewFindingInputSchema>;

export const updateReviewFindingInputSchema = createReviewFindingInputSchema.extend({
  id: z.number().int(),
});
export type UpdateReviewFindingInput = z.infer<typeof updateReviewFindingInputSchema>;

export const setFindingResolutionInputSchema = z.object({
  pullRequestId: z.number().int(),
  id: z.number().int(),
  resolution: findingResolutionSchema,
});
export type SetFindingResolutionInput = z.infer<typeof setFindingResolutionInputSchema>;
