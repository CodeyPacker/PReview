import { basename } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { RepositoriesState } from '../../../shared/contracts/repositories.ts';
import { readGitInfo, type Git } from './git-info.ts';
import { listRepositories, reconcileRepositories, type ScannedRepository } from './registry.ts';
import { findRepositories } from './scanner.ts';
import { listWatchedFolders } from './watched-folders.ts';

export interface RepositoryDiscoveryDeps {
  db: DatabaseSync;
  git: Git;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void };
}

// Scans the watched folders for Git repositories and keeps the stored list current.
// Runs one scan at a time. A scan requested during a scan runs once more afterwards,
// so a folder added mid-scan is not missed.
export class RepositoryDiscovery {
  private running: Promise<void> | undefined;
  private again = false;

  constructor(private readonly deps: RepositoryDiscoveryDeps) {}

  getState(): RepositoriesState {
    return { repositories: listRepositories(this.deps.db), scanning: this.running !== undefined };
  }

  scan(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async run(): Promise<void> {
    do {
      this.again = false;
      try {
        await this.scanOnce();
      } catch (error) {
        this.deps.log.warn('Repository scan failed', error);
      }
    } while (this.again);
  }

  private async scanOnce(): Promise<void> {
    const paths = new Set<string>();
    for (const folder of listWatchedFolders(this.deps.db)) {
      for (const path of await findRepositories(folder.path, folder.scanDepth)) paths.add(path);
    }

    const scanned: ScannedRepository[] = [];
    for (const path of paths) {
      const info = await readGitInfo(this.deps.git, path);
      scanned.push({ path, name: basename(path), ...info });
    }

    reconcileRepositories(this.deps.db, scanned);
    this.deps.log.info(`Found ${scanned.length} Git repositories`);
  }
}
