// Tests, stories and generated files support the code that ships but don't run in production.
// The changed files list can group them at the bottom, collapsed.

// Folders whose files are all tests, fixtures or snapshots.
const SUPPORT_FOLDERS = new Set([
  '__tests__',
  '__mocks__',
  '__snapshots__',
  '__fixtures__',
  'test',
  'tests',
  'e2e',
]);

// foo.test.ts, foo.spec.tsx, Button.stories.tsx, foo.gen.ts, foo.generated.ts, foo.snap.
const SUPPORT_NAME = /\.(test|spec|stories|story|gen|generated)\.[^./]+$|\.snap$/i;

const LOCKFILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'cargo.lock',
  'go.sum',
  'poetry.lock',
  'gemfile.lock',
  'composer.lock',
]);

export function isSupportFile(path: string): boolean {
  const segments = path.split('/');
  const name = segments.pop() ?? '';
  return (
    SUPPORT_NAME.test(name) ||
    LOCKFILES.has(name.toLowerCase()) ||
    segments.some((segment) => SUPPORT_FOLDERS.has(segment.toLowerCase()))
  );
}

// Splits files into the code that ships and the support files, keeping each in its order.
export function splitSupportFiles<F extends { path: string }>(
  files: readonly F[],
): { code: F[]; support: F[] } {
  const code: F[] = [];
  const support: F[] = [];
  for (const file of files) (isSupportFile(file.path) ? support : code).push(file);
  return { code, support };
}

// The files in the order the list shows them. With grouping on, support files come last and
// are left out while their group is collapsed.
export function orderForReview<F extends { path: string }>(
  files: readonly F[],
  grouped: boolean,
  supportOpen: boolean,
): F[] {
  if (!grouped) return [...files];
  const { code, support } = splitSupportFiles(files);
  return supportOpen ? [...code, ...support] : code;
}
