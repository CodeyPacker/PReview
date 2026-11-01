import { describe, expect, it } from 'vitest';
import { isCommentableLine, originalLineInModified, type LineChange } from './diffComments.ts';

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

describe('isCommentableLine', () => {
  it('takes changed lines and 3 lines of context around them', () => {
    const changes = [modifiedBlock];
    expect(isCommentableLine(changes, 'modified', 6)).toBe(false);
    expect(isCommentableLine(changes, 'modified', 7)).toBe(true);
    expect(isCommentableLine(changes, 'modified', 12)).toBe(true);
    expect(isCommentableLine(changes, 'modified', 15)).toBe(true);
    expect(isCommentableLine(changes, 'modified', 16)).toBe(false);
    expect(isCommentableLine(changes, 'original', 14)).toBe(true);
    expect(isCommentableLine(changes, 'original', 15)).toBe(false);
  });

  it('takes the context around a side with no lines in the change', () => {
    expect(isCommentableLine([insertion], 'original', 27)).toBe(false);
    expect(isCommentableLine([insertion], 'original', 28)).toBe(true);
    expect(isCommentableLine([insertion], 'original', 33)).toBe(true);
    expect(isCommentableLine([insertion], 'original', 34)).toBe(false);
    expect(isCommentableLine([deletion], 'modified', 49)).toBe(false);
    expect(isCommentableLine([deletion], 'modified', 50)).toBe(true);
    expect(isCommentableLine([deletion], 'modified', 55)).toBe(true);
  });

  it('takes nothing when there are no changes', () => {
    expect(isCommentableLine([], 'modified', 1)).toBe(false);
  });
});

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
