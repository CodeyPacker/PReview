import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Dependency, build and cache folders. Repositories checked out inside them are not the
// user's own.
export const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'venv',
  '__pycache__',
  'Pods',
  'DerivedData',
]);

// Finds the Git repositories in root and up to maxDepth folder levels below it, nested
// ones included. A repository is a folder with a .git directory. A .git file marks a
// submodule or a linked worktree, which belong to another repository, so those are
// skipped. Symlinks and hidden folders are not followed.
export async function findRepositories(root: string, maxDepth: number): Promise<string[]> {
  const found: string[] = [];

  async function visit(directory: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.name === '.git' && entry.isDirectory())) {
      found.push(directory);
    }
    if (depth >= maxDepth) return;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await visit(join(directory, entry.name), depth + 1);
    }
  }

  await visit(root, 0);
  return found;
}
