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

export const MAX_FINDING_SCREENSHOTS = 5;
// Claude takes images up to 5 MB once encoded as base64, which adds a third.
export const MAX_SCREENSHOT_BYTES = 3_500_000;
export const SCREENSHOT_DATA_URL_PREFIX = 'data:image/webp;base64,';

// The app converts every screenshot to WebP before saving it.
const screenshotDataUrlSchema = z
  .string()
  .max(SCREENSHOT_DATA_URL_PREFIX.length + Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 4)
  .regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/);
const newScreenshotsSchema = z.array(screenshotDataUrlSchema).max(MAX_FINDING_SCREENSHOTS);

// A problem with the pull request that isn't tied to a code line. It stays on this machine
// until it is published with a review, and is kept after that to track its status.
export const reviewFindingSchema = z.object({
  id: z.number().int(),
  pullRequestId: z.number().int(),
  category: findingCategorySchema,
  description: z.string(),
  // Empty when there are none.
  steps: z.string(),
  // Read one with reviewFindings.screenshot. Screenshots never go to GitHub.
  screenshotIds: z.array(z.number().int()),
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
  newScreenshots: newScreenshotsSchema,
});
export type CreateReviewFindingInput = z.infer<typeof createReviewFindingInputSchema>;

export const updateReviewFindingInputSchema = createReviewFindingInputSchema.extend({
  id: z.number().int(),
  // The saved screenshots to keep. The others are deleted.
  screenshotIds: z.array(z.number().int()).max(MAX_FINDING_SCREENSHOTS),
});
export type UpdateReviewFindingInput = z.infer<typeof updateReviewFindingInputSchema>;

export const setFindingResolutionInputSchema = z.object({
  pullRequestId: z.number().int(),
  id: z.number().int(),
  resolution: findingResolutionSchema,
});
export type SetFindingResolutionInput = z.infer<typeof setFindingResolutionInputSchema>;
