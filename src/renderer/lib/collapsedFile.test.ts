import { describe, expect, it } from 'vitest';
import { collapseReason, LARGE_DIFF_LINES } from './collapsedFile.ts';

const file = (path: string, additions = 1, deletions = 1) => ({ path, additions, deletions });

describe('collapseReason', () => {
  it('collapses lockfiles, minified files and build output as generated', () => {
    for (const path of [
      'pnpm-lock.yaml',
      'apps/web/package-lock.json',
      'public/app.min.js',
      'src/api.generated.ts',
      'dist/index.js',
      'api/user.pb.go',
    ]) {
      expect(collapseReason(file(path))).toBe('generated');
    }
  });

  it('collapses a diff above the line limit as large', () => {
    expect(collapseReason(file('src/a.ts', LARGE_DIFF_LINES, 1))).toBe('large');
    expect(collapseReason(file('src/a.ts', LARGE_DIFF_LINES - 1, 1))).toBeUndefined();
  });

  it('opens ordinary files', () => {
    expect(collapseReason(file('src/distance.ts'))).toBeUndefined();
    expect(collapseReason(file('docs/build.md'))).toBeUndefined();
  });
});
