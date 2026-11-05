import { EventEmitter } from 'node:events';
import type { FSWatcher } from 'node:fs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { classifyChange, FolderWatcher } from './folder-watcher.ts';
import { reconcileRepositories } from './registry.ts';
import {
  addWatchedFolder,
  removeWatchedFolder,
  setWatchedFolderScanDepth,
} from './watched-folders.ts';

let root: string;
let db: ReturnType<typeof openDatabase>;
let scan: Mock<() => void>;
let watcher: FolderWatcher;
let listeners: Map<string, (event: string, filename: string | null) => void>;
let closed: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'preview-watcher-'));
  db = openDatabase(':memory:');
  migrate(db);
  scan = vi.fn<() => void>();
  listeners = new Map();
  closed = [];
  watcher = new FolderWatcher({
    db,
    scan,
    log: { warn: vi.fn() },
    delayMs: 10,
    watchFolder: (path, listener) => {
      listeners.set(path, listener);
      const fake = new EventEmitter() as FSWatcher;
      fake.close = () => closed.push(path);
      return fake;
    },
  });
});

afterEach(() => {
  watcher.stop();
  rmSync(root, { recursive: true, force: true });
});

const scanned = () => vi.waitFor(() => expect(scan).toHaveBeenCalledOnce());

async function notScanned() {
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(scan).not.toHaveBeenCalled();
}

function start() {
  addWatchedFolder(db, root);
  watcher.sync();
  return listeners.get(root)!;
}

describe('classifyChange', () => {
  it.each([
    ['.git', 0, 'repository'],
    [join('app', '.git'), 1, 'repository'],
    [join('app', '.git', 'config'), 1, 'repository'],
    ['app', 1, 'folder'],
    [join('group', 'app'), 2, 'folder'],
    // Below the scan depth.
    ['app', 0, 'ignore'],
    [join('group', 'app', '.git'), 1, 'ignore'],
    // Git's own activity.
    [join('app', '.git', 'index'), 4, 'ignore'],
    [join('app', '.git', 'refs', 'heads', 'main'), 4, 'ignore'],
    // Folders the scanner skips.
    [join('app', 'node_modules', 'left-pad'), 4, 'ignore'],
    [join('node_modules', 'left-pad', '.git'), 4, 'ignore'],
    [join('.cache', 'app'), 4, 'ignore'],
  ])('classifies %s at depth %i as %s', (path, depth, expected) => {
    expect(classifyChange(path, depth)).toBe(expected);
  });
});

describe('FolderWatcher', () => {
  it('scans when a repository appears', async () => {
    start()('rename', join('app', '.git'));
    await scanned();
  });

  it('scans when a remote is added', async () => {
    start()('change', join('app', '.git', 'config'));
    await scanned();
  });

  it('scans when a folder moves in', async () => {
    mkdirSync(join(root, 'moved'));
    start()('rename', 'moved');
    await scanned();
  });

  it('scans when a known repository moves out', async () => {
    const listener = start();
    reconcileRepositories(db, [
      {
        path: join(root, 'group', 'app'),
        name: 'app',
        remoteUrl: null,
        rootCommit: null,
      },
    ]);
    listener('rename', 'group');
    await scanned();
  });

  it('runs one scan for a burst of changes', async () => {
    const listener = start();
    listener('rename', join('a', '.git'));
    listener('rename', join('b', '.git'));
    await scanned();
  });

  it('ignores saved and deleted files', async () => {
    writeFileSync(join(root, 'notes.md'), '');
    const listener = start();
    listener('rename', 'notes.md');
    listener('rename', 'notes.md.tmp');
    listener('change', 'notes.md');
    await notScanned();
  });

  it('uses the new scan depth', async () => {
    const listener = start();
    setWatchedFolderScanDepth(db, 1, 0);
    watcher.sync();
    listener('rename', join('app', '.git'));
    await notScanned();
  });

  it('stops watching a removed folder', async () => {
    const listener = start();
    removeWatchedFolder(db, 1);
    watcher.sync();
    expect(closed).toEqual([root]);
    listener('rename', join('app', '.git'));
    await notScanned();
  });

  it('does not scan after stopping', async () => {
    const listener = start();
    listener('rename', join('app', '.git'));
    watcher.stop();
    await notScanned();
  });

  it('notices a real repository in a real folder', async () => {
    const realScan = vi.fn();
    const real = new FolderWatcher({ db, scan: realScan, log: { warn: vi.fn() }, delayMs: 10 });
    addWatchedFolder(db, root);
    real.sync();
    await new Promise((resolve) => setTimeout(resolve, 200));
    mkdirSync(join(root, 'app', '.git'), { recursive: true });
    await vi.waitFor(() => expect(realScan).toHaveBeenCalled(), { timeout: 5000 });
    real.stop();
  });
});
