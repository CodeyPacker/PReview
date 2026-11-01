// One changed region, as Monaco reports it. An end of 0 means the side has no lines in the
// region, and its start is then the line the other side's lines come after.
export interface LineChange {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
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

// The lines a selection covers. A selection that ends at the start of a line, as a whole-line
// selection does, leaves that line out.
export function selectedLines(selection: {
  startLineNumber: number;
  endLineNumber: number;
  endColumn: number;
}): { first: number; last: number } {
  const { startLineNumber: first, endLineNumber, endColumn } = selection;
  const last = endLineNumber > first && endColumn === 1 ? endLineNumber - 1 : endLineNumber;
  return { first, last };
}
