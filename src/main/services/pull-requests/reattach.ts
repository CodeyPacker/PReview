import type { DiffHunk } from '../../../shared/contracts/pull-request-files.ts';

// Where lines of a file are after the commits that changed it, or null when a change touches
// them or sits so close that the move isn't certain. Hunks include the unchanged lines around
// a change, so a comment a few lines from an edit counts as touched. Lines before every hunk
// stay where they are, and lines after a hunk move by the lines it added or removed.
export function moveLines(
  hunks: readonly DiffHunk[],
  startLine: number,
  endLine: number,
): { startLine: number; endLine: number } | null {
  let shift = 0;
  for (const hunk of hunks) {
    const first = hunk.originalStart;
    // An insertion has no old lines. It sits between the line at originalStart and the next.
    const last = hunk.originalCount === 0 ? first + 1 : hunk.originalStart + hunk.originalCount - 1;
    if (first <= endLine && last >= startLine) return null;
    if (last < startLine) shift += hunk.modifiedCount - hunk.originalCount;
  }
  return { startLine: startLine + shift, endLine: endLine + shift };
}
