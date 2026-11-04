import { describe, expect, it } from 'vitest';
import { isSupportFile, orderForReview, splitSupportFiles } from './supportFiles.ts';

describe('isSupportFile', () => {
  it.each([
    'src/main/sync.test.ts',
    'src/app/Button.spec.tsx',
    'src/components/Button/Button.stories.tsx',
    'src/renderer/routeTree.gen.ts',
    'src/api/client.generated.ts',
    'src/__snapshots__/view.ts.snap',
    'src/__tests__/helpers.ts',
    'e2e/app.spec.ts',
    'e2e/mocks.ts',
    'packages/core/test/fixtures.ts',
    'pnpm-lock.yaml',
    'apps/web/package-lock.json',
  ])('treats %s as a support file', (path) => {
    expect(isSupportFile(path)).toBe(true);
  });

  it.each([
    'src/main/sync.ts',
    'src/renderer/app/ChangedFiles.tsx',
    'src/testing-library.ts',
    'src/latest/index.ts',
    'src/contest.ts',
    'package.json',
    'SCOPE/PLAN.md',
  ])('treats %s as code', (path) => {
    expect(isSupportFile(path)).toBe(false);
  });
});

describe('orderForReview', () => {
  const files = ['a.test.ts', 'a.ts', 'b.stories.tsx', 'b.ts'].map((path) => ({ path }));
  const paths = (list: { path: string }[]) => list.map((file) => file.path);

  it('keeps the order when grouping is off', () => {
    expect(paths(orderForReview(files, false, false))).toEqual([
      'a.test.ts',
      'a.ts',
      'b.stories.tsx',
      'b.ts',
    ]);
  });

  it('leaves support files out while their group is collapsed', () => {
    expect(paths(orderForReview(files, true, false))).toEqual(['a.ts', 'b.ts']);
  });

  it('puts support files last once their group is open', () => {
    expect(paths(orderForReview(files, true, true))).toEqual([
      'a.ts',
      'b.ts',
      'a.test.ts',
      'b.stories.tsx',
    ]);
  });

  it('splits files into code and support', () => {
    const { code, support } = splitSupportFiles(files);
    expect(paths(code)).toEqual(['a.ts', 'b.ts']);
    expect(paths(support)).toEqual(['a.test.ts', 'b.stories.tsx']);
  });
});
