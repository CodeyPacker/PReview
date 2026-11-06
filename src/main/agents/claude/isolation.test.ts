import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PNPM_VIRTUAL_STORE, prepareIsolation } from './isolation.ts';

describe('prepareIsolation', () => {
  let worktree: string;
  let cache: string;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), 'isolation-test-'));
    await mkdir(join(worktree, 'node_modules'));
    cache = join(worktree, '.package-cache');
  });

  afterEach(() => rm(worktree, { recursive: true, force: true }));

  it('keeps downloaded packages between runs, where commands can write them', async () => {
    const isolation = await prepareIsolation(worktree, cache);
    expect(isolation.env.npm_config_store_dir).toContain('.package-cache');
    expect(isolation.env.npm_config_cache).toContain('.package-cache');
    const folder = dirname(isolation.env.npm_config_store_dir!);
    expect(isolation.sandbox.filesystem?.allowWrite).toContain(folder);
    expect(isolation.sandbox.filesystem?.allowRead).toContain(folder);
    await isolation.close();
    expect(existsSync(folder)).toBe(true);
    expect(existsSync(isolation.env.TMPDIR!)).toBe(false);
  });

  it('points pnpm’s packages at the temp folder', async () => {
    const isolation = await prepareIsolation(worktree, cache);
    expect(isolation.env.npm_config_virtual_store_dir).toBe(
      join(isolation.env.TMPDIR!, PNPM_VIRTUAL_STORE),
    );
    await isolation.close();
  });

  it('removes node_modules with the temp folder when pnpm linked it there', async () => {
    const isolation = await prepareIsolation(worktree, cache);
    await mkdir(isolation.env.npm_config_virtual_store_dir!);
    await isolation.close();
    expect(existsSync(isolation.env.TMPDIR!)).toBe(false);
    expect(existsSync(join(worktree, 'node_modules'))).toBe(false);
  });

  it('keeps node_modules when pnpm did not use the temp folder', async () => {
    const isolation = await prepareIsolation(worktree, cache);
    await isolation.close();
    expect(existsSync(isolation.env.TMPDIR!)).toBe(false);
    expect(existsSync(join(worktree, 'node_modules'))).toBe(true);
  });
});
