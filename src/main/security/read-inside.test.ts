import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileInside } from './read-inside.ts';

let folder: string;
let root: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'preview-read-inside-'));
  root = join(folder, 'worktree');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'CLAUDE.md'), 'Run the tests.');
  writeFileSync(join(folder, 'credentials'), 'secret');
});

afterEach(() => rmSync(folder, { recursive: true, force: true }));

describe('readFileInside', () => {
  it('reads a regular file in the folder', async () => {
    expect((await readFileInside(root, 'docs/CLAUDE.md'))?.toString()).toBe('Run the tests.');
  });

  it('refuses a symlink, even one that points inside', async () => {
    symlinkSync(join(folder, 'credentials'), join(root, 'CLAUDE.md'));
    symlinkSync(join(root, 'docs', 'CLAUDE.md'), join(root, 'inside.md'));
    await expect(readFileInside(root, 'CLAUDE.md')).resolves.toBeNull();
    await expect(readFileInside(root, 'inside.md')).resolves.toBeNull();
  });

  it('refuses a path through a symlinked folder or up out of the folder', async () => {
    symlinkSync(folder, join(root, 'up'));
    await expect(readFileInside(root, 'up/credentials')).resolves.toBeNull();
    await expect(readFileInside(root, '../credentials')).resolves.toBeNull();
  });

  it('resolves null for a missing file or a folder', async () => {
    await expect(readFileInside(root, 'missing.md')).resolves.toBeNull();
    await expect(readFileInside(root, 'docs')).resolves.toBeNull();
  });
});
