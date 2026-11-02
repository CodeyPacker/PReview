import { z } from 'zod';

export const fileReviewStateSchema = z.enum(['approved', 'flagged']);
export type FileReviewState = z.infer<typeof fileReviewStateSchema>;

// A file the reviewer approved or flagged, kept on this machine.
export const fileReviewMarkSchema = z.object({
  path: z.string(),
  state: fileReviewStateSchema,
  // The file's id when it was marked. The mark applies only while the file still has it.
  blobSha: z.string(),
});
export type FileReviewMark = z.infer<typeof fileReviewMarkSchema>;

export const setFileReviewMarkInputSchema = z.object({
  pullRequestId: z.number().int(),
  path: z.string(),
  // Null removes the mark.
  state: fileReviewStateSchema.nullable(),
  blobSha: z.string(),
});
export type SetFileReviewMarkInput = z.infer<typeof setFileReviewMarkInputSchema>;
