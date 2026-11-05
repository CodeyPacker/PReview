import { watch, type FSWatcher } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { listRepositories } from './registry.ts';
import { IGNORED_DIRECTORIES } from './scanner.ts';
import { listWatchedFolders } from './watched-folders.ts';

// Waits for a burst of changes to end, such as a clone, before scanning.
const SCAN_DELAY_MS = 2_000;

export type WatchFolder = (
  path: string,
  listener: (event: string, filename: string | null) => void,
) => FSWatcher;

export interface FolderWatcherDeps {
  db: DatabaseSync;
  scan: () => void;
  log: { warn(...args: unknown[]): void };
  watchFolder?: WatchFolder;
  delayMs?: number;
}

// What a change at this path, relative to a watched folder, can mean for the repository
// list. repository: a .git folder or its config changed, which also covers a remote added
// after the repository appeared. folder: it could be a repository moved in or out. Everything
// else is ignored, since most changes are ordinary edits and builds.
export function classifyChange(
  relativePath: string,
  scanDepth: number,
): 'repository' | 'folder' | 'ignore' {
  const parts = relativePath.split(sep);
  const marker =
    parts.at(-1) === '.git' ? 1 : parts.at(-1) === 'config' && parts.at(-2) === '.git' ? 2 : 0;
  const folders = parts.slice(0, parts.length - marker);
  if (folders.length > scanDepth) return 'ignore';
  if (folders.some((name) => name.startsWith('.') || IGNORED_DIRECTORIES.has(name))) {
    return 'ignore';
  }
  return marker > 0 ? 'repository' : 'folder';
}

// Scans again when something in a watched folder could change the repository list.
export class FolderWatcher {
  private readonly watches = new Map<string, { watcher: FSWatcher; scanDepth: number }>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private readonly deps: FolderWatcherDeps) {}

  // Matches the watches to the watched folders. Runs after each scan, and every change to the
  // folders starts a scan. A folder that couldn't be watched is tried again here.
  sync(): void {
    if (this.stopped) return;
    const folders = listWatchedFolders(this.deps.db);
    for (const [path, { watcher }] of this.watches) {
      if (folders.some((folder) => folder.path === path)) continue;
      watcher.close();
      this.watches.delete(path);
    }
    for (const { path, scanDepth } of folders) {
      const current = this.watches.get(path);
      if (current) current.scanDepth = scanDepth;
      else this.open(path, scanDepth);
    }
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    for (const { watcher } of this.watches.values()) watcher.close();
    this.watches.clear();
  }

  private open(path: string, scanDepth: number): void {
    const watchFolder: WatchFolder =
      this.deps.watchFolder ?? ((folder, listener) => watch(folder, { recursive: true }, listener));
    try {
      const watcher = watchFolder(path, (event, filename) => {
        void this.handleChange(path, event, filename);
      });
      watcher.on('error', (error) => {
        this.deps.log.warn(`Stopped watching ${path}`, error);
        watcher.close();
        this.watches.delete(path);
      });
      this.watches.set(path, { watcher, scanDepth });
    } catch (error) {
      this.deps.log.warn(`Could not watch ${path}`, error);
    }
  }

  private async handleChange(root: string, event: string, filename: string | null): Promise<void> {
    const scanDepth = this.watches.get(root)?.scanDepth;
    if (scanDepth === undefined) return;
    // Some platforms can't name what changed.
    if (filename === null) return this.scheduleScan();

    const change = classifyChange(filename, scanDepth);
    if (change === 'repository') return this.scheduleScan();
    // Only a rename event means something appeared or disappeared.
    if (change === 'folder' && event === 'rename') {
      if (await this.isRepositoryLocation(join(root, filename))) this.scheduleScan();
    }
  }

  // A folder that exists could hold a repository. A path that is gone only matters when a
  // known repository was there, which rules out deleted files and temporary save files.
  private async isRepositoryLocation(path: string): Promise<boolean> {
    try {
      return (await lstat(path)).isDirectory();
    } catch {
      if (this.stopped) return false;
      return listRepositories(this.deps.db).some(
        (repository) => repository.path === path || repository.path.startsWith(path + sep),
      );
    }
  }

  private scheduleScan(): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.deps.scan();
    }, this.deps.delayMs ?? SCAN_DELAY_MS);
  }
}
