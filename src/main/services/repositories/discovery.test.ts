import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { RepositoryDiscovery } from './discovery.ts';
import type { Git } from './git-info.ts';
import { addWatchedFolder, setWatchedFolderScanDepth } from './watched-folders.ts';

let root: string;
let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'preview-discovery-'));
  db = openDatabase(':memory:');
  migrate(db);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

// Answers from the folder name, so each repository gets its own remote and root commit.
const git: Git = (cwd, args) => {
  const name = cwd.split('/').at(-1);
  return Promise.resolve(args[0] === 'config' ? `git@github.com:octo/${name}.git` : `root-${name}`);
};

function setup() {
  return new RepositoryDiscovery({ db, git, log: { info: vi.fn(), warn: vi.fn() } });
}

function repo(...segments: string[]): string {
  const path = join(root, ...segments);
  mkdirSync(join(path, '.git'), { recursive: true });
  return path;
}

describe('RepositoryDiscovery', () => {
  it('lists the repositories in watched folders with their GitHub names', async () => {
    repo('alpha');
    repo('group', 'beta');
    addWatchedFolder(db, root);
    const discovery = setup();

    await discovery.scan();

    const { repositories, scanning } = discovery.getState();
    expect(scanning).toBe(false);
    expect(repositories.map((repository) => repository.github)).toEqual([
      { owner: 'octo', name: 'alpha' },
      { owner: 'octo', name: 'beta' },
    ]);
  });

  it('honors each folder’s scan depth', async () => {
    repo('group', 'deep');
    addWatchedFolder(db, root);
    const discovery = setup();

    setWatchedFolderScanDepth(db, 1, 1);
    await discovery.scan();
    expect(discovery.getState().repositories).toEqual([]);

    setWatchedFolderScanDepth(db, 1, 2);
    await discovery.scan();
    expect(discovery.getState().repositories).toHaveLength(1);
  });

  it('marks repositories unavailable when their folder is no longer watched', async () => {
    repo('alpha');
    addWatchedFolder(db, root);
    const discovery = setup();
    await discovery.scan();

    db.exec('DELETE FROM watched_folders');
    await discovery.scan();

    expect(discovery.getState().repositories.map((repository) => repository.status)).toEqual([
      'unavailable',
    ]);
  });

  it('runs one more scan when asked during a scan', async () => {
    repo('alpha');
    addWatchedFolder(db, root);
    const discovery = setup();

    const first = discovery.scan();
    expect(discovery.getState().scanning).toBe(true);
    repo('beta');
    await Promise.all([first, discovery.scan()]);

    expect(discovery.getState().repositories).toHaveLength(2);
  });
});
