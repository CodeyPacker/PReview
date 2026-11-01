import { describe, expect, it } from 'vitest';
import { originalLineInModified, selectedLines, type LineChange } from './diffComments.ts';

// Old lines 10-11 became new lines 10-12.
const modifiedBlock: LineChange = {
  originalStartLineNumber: 10,
  originalEndLineNumber: 11,
  modifiedStartLineNumber: 10,
  modifiedEndLineNumber: 12,
};
// Two lines added after old line 30 (new lines 32-33).
const insertion: LineChange = {
  originalStartLineNumber: 30,
  originalEndLineNumber: 0,
  modifiedStartLineNumber: 32,
  modifiedEndLineNumber: 33,
};
// Old lines 50-52 removed. They came after new line 52.
const deletion: LineChange = {
  originalStartLineNumber: 50,
  originalEndLineNumber: 52,
  modifiedStartLineNumber: 52,
  modifiedEndLineNumber: 0,
};

describe('originalLineInModified', () => {
  const changes = [modifiedBlock, insertion, deletion];

  it('keeps lines before any change', () => {
    expect(originalLineInModified(changes, 5)).toBe(5);
  });

  it('puts a changed old line at the end of its new block', () => {
    expect(originalLineInModified(changes, 10)).toBe(12);
    expect(originalLineInModified(changes, 51)).toBe(52);
  });

  it('shifts unchanged lines by what was added and removed before them', () => {
    // One line added by the first change.
    expect(originalLineInModified(changes, 20)).toBe(21);
    expect(originalLineInModified(changes, 30)).toBe(31);
    // Plus two inserted lines.
    expect(originalLineInModified(changes, 31)).toBe(34);
    // Minus three removed lines.
    expect(originalLineInModified(changes, 49)).toBe(52);
    expect(originalLineInModified(changes, 53)).toBe(53);
  });
});

describe('selectedLines', () => {
  it('covers every line the selection touches', () => {
    expect(selectedLines({ startLineNumber: 3, endLineNumber: 5, endColumn: 4 })).toEqual({
      first: 3,
      last: 5,
    });
  });

  it('leaves out a last line the selection only reaches the start of', () => {
    expect(selectedLines({ startLineNumber: 3, endLineNumber: 6, endColumn: 1 })).toEqual({
      first: 3,
      last: 5,
    });
  });

  it('is one line for a cursor', () => {
    expect(selectedLines({ startLineNumber: 4, endLineNumber: 4, endColumn: 1 })).toEqual({
      first: 4,
      last: 4,
    });
  });
});
