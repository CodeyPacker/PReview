import type { PullRequestFile } from '../../shared/contracts/pull-request-files.ts';

// Diffs with more changed lines than this start collapsed.
export const LARGE_DIFF_LINES = 1000;

const generatedPaths = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/,
  /(^|\/)(Cargo\.lock|Gemfile\.lock|poetry\.lock|composer\.lock|go\.sum|Pipfile\.lock)$/,
  /\.min\.(js|css)$/,
  /\.(map|snap)$/,
  /\.generated\./,
  /\.pb\.go$/,
  /(^|\/)(dist|build|node_modules|vendor)\//,
];

export type CollapseReason = 'generated' | 'large';

// Why a file's diff starts collapsed, or undefined when it opens right away.
export function collapseReason(
  file: Pick<PullRequestFile, 'path' | 'additions' | 'deletions'>,
): CollapseReason | undefined {
  if (generatedPaths.some((pattern) => pattern.test(file.path))) return 'generated';
  if (file.additions + file.deletions > LARGE_DIFF_LINES) return 'large';
  return undefined;
}
