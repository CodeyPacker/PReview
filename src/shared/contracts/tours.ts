import { z } from 'zod';
import { commitShaSchema } from './pull-request-files.ts';

export const tourStopSchema = z.object({
  file: z.string().min(1),
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  group: z.string(),
  title: z.string().min(1),
  body: z.string().min(1),
});
export type TourStop = z.infer<typeof tourStopSchema>;

export const tourSchema = z.object({
  title: z.string().min(1),
  summary: z.string(),
  stops: z.array(tourStopSchema).min(1).max(80),
});
export type Tour = z.infer<typeof tourSchema>;

export const tourProviderSchema = z.enum(['claude', 'codex']);
export type TourProvider = z.infer<typeof tourProviderSchema>;

export const tourDepthSchema = z.enum(['overview', 'normal', 'deep']);
export type TourDepth = z.infer<typeof tourDepthSchema>;

export const startTourInputSchema = z.object({
  pullRequestId: z.number().int().positive(),
  headSha: commitShaSchema,
  mergeBase: commitShaSchema,
  depth: tourDepthSchema.optional(),
  provider: tourProviderSchema.optional(),
});
export type StartTourInput = z.infer<typeof startTourInputSchema>;

export const askTourInputSchema = startTourInputSchema.extend({
  stop: tourStopSchema,
  question: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        question: z.string().max(4000),
        answer: z.string().max(12000),
      }),
    )
    .max(6)
    .optional(),
});
export type AskTourInput = z.infer<typeof askTourInputSchema>;

export const tourMessageKindSchema = z.enum(['deeper', 'technical', 'ask']);
export type TourMessageKind = z.infer<typeof tourMessageKindSchema>;
export const tourMessageSchema = z.object({
  id: z.number().int(),
  stopIndex: z.number().int().nonnegative(),
  kind: tourMessageKindSchema,
  question: z.string(),
  answer: z.string().nullable(),
  status: z.enum(['pending', 'completed', 'failed']),
  error: z.string().nullable(),
  createdAt: z.string(),
  durationMs: z.number().int().nonnegative(),
});
export const savedTourSummarySchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  provider: tourProviderSchema,
  depth: tourDepthSchema,
  currentStop: z.number().int().nonnegative(),
  totalStops: z.number().int().positive(),
  visitedStops: z.number().int().nonnegative(),
  activeMs: z.number().int().nonnegative(),
  generationMs: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type SavedTourSummary = z.infer<typeof savedTourSummarySchema>;
export const savedTourSchema = savedTourSummarySchema.extend({
  plan: tourSchema,
  messages: z.array(tourMessageSchema),
});
export type SavedTour = z.infer<typeof savedTourSchema>;
export const savedTourInputSchema = startTourInputSchema.extend({
  tourId: z.number().int().positive(),
});
export type SavedTourInput = z.infer<typeof savedTourInputSchema>;
export const tourProgressInputSchema = z.object({
  tourId: z.number().int().positive(),
  stopIndex: z.number().int().min(0).max(79).optional(),
  activeMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  complete: z.boolean().optional(),
});
export type TourProgressInput = z.infer<typeof tourProgressInputSchema>;
export const askSavedTourInputSchema = savedTourInputSchema.extend({
  stopIndex: z.number().int().min(0).max(79),
  kind: tourMessageKindSchema,
  question: z.string().trim().min(1).max(4000),
});
export type AskSavedTourInput = z.infer<typeof askSavedTourInputSchema>;
