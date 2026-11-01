import type { DiffSide } from '../../shared/contracts/review-drafts.ts';

// One changed region, as Monaco reports it. An end of 0 means the side has no lines in the
// region, and its start is then the line the other side's lines come after.
export interface LineChange {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}

// GitHub only takes line comments inside a diff hunk: the changed lines plus 3 lines of
// context on each side.
const CONTEXT = 3;

function range(change: LineChange, side: DiffSide): [number, number] {
  const start =
    side === 'original' ? change.originalStartLineNumber : change.modifiedStartLineNumber;
  const end = side === 'original' ? change.originalEndLineNumber : change.modifiedEndLineNumber;
  // With no lines on this side, the hunk's context is the lines around the gap.
  return end === 0 ? [start - CONTEXT + 1, start + CONTEXT] : [start - CONTEXT, end + CONTEXT];
}

// Whether a line on one side of the diff can take a comment.
export function isCommentableLine(
  changes: readonly LineChange[],
  side: DiffSide,
  line: number,
): boolean {
  return changes.some((change) => {
    const [start, end] = range(change, side);
    return line >= start && line <= end;
  });
}

// Where an old-file line sits in the new file, for showing old-side comments in the
// unified view. A removed line maps to the last new line before or at its change.
export function originalLineInModified(changes: readonly LineChange[], line: number): number {
  let shift = 0;
  for (const change of changes) {
    const removed = change.originalEndLineNumber !== 0;
    if (removed && line >= change.originalStartLineNumber && line <= change.originalEndLineNumber) {
      return change.modifiedEndLineNumber === 0
        ? change.modifiedStartLineNumber
        : change.modifiedEndLineNumber;
    }
    const afterChange = removed
      ? line > change.originalEndLineNumber
      : line > change.originalStartLineNumber;
    if (!afterChange) break;
    const originalCount = removed
      ? change.originalEndLineNumber - change.originalStartLineNumber + 1
      : 0;
    const modifiedCount =
      change.modifiedEndLineNumber === 0
        ? 0
        : change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
    shift += modifiedCount - originalCount;
  }
  return line + shift;
}
