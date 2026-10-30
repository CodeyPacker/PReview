import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readGitInfo, runGit, type Git } from './git-info.ts';

describe('readGitInfo', () => {
  it('reads the origin remote and the smallest root commit', async () => {
    const git: Git = (_cwd, args) =>
      args[0] === 'config'
        ? Promise.resolve('git@github.com:octo/hello.git')
        : Promise.resolve('bbb\naaa');
    expect(await readGitInfo(git, '/repo')).toEqual({
      remoteUrl: 'git@github.com:octo/hello.git',
      rootCommit: 'aaa',
    });
  });

  it('reads missing values as null', async () => {
    const git: Git = () => Promise.reject(new Error('fatal'));
    expect(await readGitInfo(git, '/repo')).toEqual({ remoteUrl: null, rootCommit: null });
  });
});

describe('readGitInfo with git', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'preview-git-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();

  it('reads a repository without commits or a remote', async () => {
    git('init', '-q');
    expect(await readGitInfo(runGit, dir)).toEqual({ remoteUrl: null, rootCommit: null });
  });

  it('reads the first commit and origin of a real repository', async () => {
    git('init', '-q');
    git('remote', 'add', 'origin', 'https://github.com/octo/hello.git');
    git('commit', '-q', '--allow-empty', '-m', 'first');
    const first = git('rev-parse', 'HEAD');
    git('commit', '-q', '--allow-empty', '-m', 'second');
    expect(await readGitInfo(runGit, dir)).toEqual({
      remoteUrl: 'https://github.com/octo/hello.git',
      rootCommit: first,
    });
  });
});
