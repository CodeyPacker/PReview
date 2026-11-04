import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

// Reads a file of a folder whose contents came from someone else, such as a pull request's
// worktree. A symlink, or a path through a symlinked folder, could point anywhere on this
// machine, so the file must be a regular file whose real path stays inside the folder.
// Resolves null when it isn't, or can't be read.
export async function readFileInside(root: string, path: string): Promise<Buffer | null> {
  try {
    const full = join(root, path);
    if (!(await lstat(full)).isFile()) return null;
    const inside = relative(await realpath(root), await realpath(full));
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return null;
    return await readFile(full);
  } catch {
    return null;
  }
}
