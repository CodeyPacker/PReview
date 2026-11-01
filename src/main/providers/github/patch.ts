import type { DiffHunk } from '../../../shared/contracts/pull-request-files.ts';

// "@@ -12,7 +12,9 @@ context". A count left out is 1.
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;

// The hunks of one file's unified diff, from their headers.
export function parseHunks(patch: string): DiffHunk[] {
  return [...patch.matchAll(HUNK_HEADER)].map(
    ([, originalStart, originalCount, modifiedStart, modifiedCount]) => ({
      originalStart: Number(originalStart),
      originalCount: Number(originalCount ?? 1),
      modifiedStart: Number(modifiedStart),
      modifiedCount: Number(modifiedCount ?? 1),
    }),
  );
}
