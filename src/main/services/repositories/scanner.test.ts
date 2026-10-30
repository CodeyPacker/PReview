import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findRepositories } from './scanner.ts';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'preview-scan-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function repo(...segments: string[]): string {
  const path = join(root, ...segments);
  mkdirSync(join(path, '.git'), { recursive: true });
  return path;
}

describe('findRepositories', () => {
  it('finds repositories at any depth within the limit, nested ones included', async () => {
    const a = repo('a');
    const b = repo('work', 'b');
    const nested = repo('a', 'packages', 'nested');
    expect((await findRepositories(root, 4)).sort()).toEqual([a, nested, b].sort());
  });

  it('checks the root itself at depth 0', async () => {
    mkdirSync(join(root, '.git'));
    repo('child');
    expect(await findRepositories(root, 0)).toEqual([root]);
  });

  it('stops at the scan depth', async () => {
    const shallow = repo('one');
    repo('one', 'two', 'three');
    expect(await findRepositories(root, 1)).toEqual([shallow]);
  });

  it('skips dependency and generated folders', async () => {
    repo('node_modules', 'left-pad');
    repo('app', 'vendor', 'lib');
    repo('app', 'dist', 'copy');
    const app = repo('app');
    expect(await findRepositories(root, 5)).toEqual([app]);
  });

  it('skips hidden folders', async () => {
    repo('.cache', 'clone');
    expect(await findRepositories(root, 3)).toEqual([]);
  });

  it('does not treat a submodule or linked worktree as a repository', async () => {
    const parent = repo('parent');
    mkdirSync(join(parent, 'sub'));
    writeFileSync(join(parent, 'sub', '.git'), 'gitdir: ../.git/modules/sub\n');
    mkdirSync(join(root, 'worktree'));
    writeFileSync(join(root, 'worktree', '.git'), 'gitdir: /elsewhere/.git/worktrees/w\n');
    expect(await findRepositories(root, 3)).toEqual([parent]);
  });

  it('does not follow symlinks', async () => {
    const target = mkdtempSync(join(tmpdir(), 'preview-scan-target-'));
    try {
      mkdirSync(join(target, '.git'));
      symlinkSync(target, join(root, 'link'), 'dir');
      expect(await findRepositories(root, 3)).toEqual([]);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('finds nothing in a missing folder', async () => {
    expect(await findRepositories(join(root, 'missing'), 3)).toEqual([]);
  });
});
