import { describe, expect, it } from 'vitest';
import { moveLines } from './reattach.ts';

const hunk = (originalStart: number, originalCount: number, modifiedCount: number) => ({
  originalStart,
  originalCount,
  modifiedStart: originalStart,
  modifiedCount,
});

describe('moveLines', () => {
  it('keeps lines when nothing changed', () => {
    expect(moveLines([], 5, 6)).toEqual({ startLine: 5, endLine: 6 });
  });

  it('keeps lines above a change and moves lines below it by what it added or removed', () => {
    const hunks = [hunk(20, 7, 10)];
    expect(moveLines(hunks, 5, 7)).toEqual({ startLine: 5, endLine: 7 });
    expect(moveLines(hunks, 30, 31)).toEqual({ startLine: 33, endLine: 34 });
    expect(moveLines([hunk(20, 7, 4)], 30, 30)).toEqual({ startLine: 27, endLine: 27 });
  });

  it('adds up every change above the lines', () => {
    expect(moveLines([hunk(5, 5, 7), hunk(20, 5, 4)], 40, 40)).toEqual({
      startLine: 41,
      endLine: 41,
    });
  });

  it('gives up when a change touches the lines, including the lines around it', () => {
    const hunks = [hunk(20, 7, 10)];
    expect(moveLines(hunks, 20, 20)).toBeNull();
    expect(moveLines(hunks, 26, 30)).toBeNull();
    expect(moveLines(hunks, 10, 22)).toBeNull();
  });

  it('gives up on a comment next to an insertion', () => {
    expect(moveLines([hunk(10, 0, 3)], 10, 10)).toBeNull();
    expect(moveLines([hunk(10, 0, 3)], 11, 11)).toBeNull();
    expect(moveLines([hunk(10, 0, 3)], 12, 12)).toEqual({ startLine: 15, endLine: 15 });
  });
});
