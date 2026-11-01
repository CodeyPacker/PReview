import { describe, expect, it } from 'vitest';
import { parseHunks } from './patch.ts';

describe('parseHunks', () => {
  it('reads every hunk header', () => {
    const patch = [
      '@@ -1,4 +1,5 @@ import',
      ' a',
      '-b',
      '+b2',
      '+b3',
      ' c',
      ' d',
      '@@ -40,3 +41,3 @@ export function total() {',
      ' x',
      '-y',
      '+z',
      ' w',
    ].join('\n');

    expect(parseHunks(patch)).toEqual([
      { originalStart: 1, originalCount: 4, modifiedStart: 1, modifiedCount: 5 },
      { originalStart: 40, originalCount: 3, modifiedStart: 41, modifiedCount: 3 },
    ]);
  });

  it('reads a missing count as 1 and keeps empty sides', () => {
    expect(parseHunks('@@ -0,0 +1 @@\n+only')).toEqual([
      { originalStart: 0, originalCount: 0, modifiedStart: 1, modifiedCount: 1 },
    ]);
  });

  it('ignores lines that only look like headers', () => {
    expect(parseHunks('@@ -1 +1 @@\n-@@ -5,2 +5,2 @@\n+x')).toHaveLength(1);
  });
});
