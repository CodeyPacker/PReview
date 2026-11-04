import { z } from 'zod';

// exported: the copy was written to path. canceled: the user closed the file dialog.
export const exportBackupResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('exported'), path: z.string() }),
  z.object({ status: z.literal('canceled') }),
]);
export type ExportBackupResult = z.infer<typeof exportBackupResultSchema>;

// A restore that goes ahead restarts PReview, so it never resolves. invalid: the file isn't a
// backup this version can use. The message says why and is safe to show.
export const restoreBackupResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('canceled') }),
  z.object({ status: z.literal('invalid'), message: z.string() }),
]);
export type RestoreBackupResult = z.infer<typeof restoreBackupResultSchema>;
