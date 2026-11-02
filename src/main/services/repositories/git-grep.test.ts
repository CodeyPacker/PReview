import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runGitGrep } from './git-grep.ts';

let folder: string;
let head: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: folder, encoding: 'utf8' }).trim();
}

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'preview-grep-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.test');
  git('config', 'user.name', 'Test');
  mkdirSync(join(folder, 'src'));
  writeFileSync(join(folder, 'src', 'a.ts'), 'one\nconst Needle = 1;\nneedle again\n');
  writeFileSync(join(folder, 'b.txt'), 'nothing here\n');
  writeFileSync(join(folder, 'image.bin'), Buffer.from([0, 1, 2, 110, 101, 101, 100, 108, 101]));
  git('add', '.');
  git('commit', '-q', '-m', 'first');
  head = git('rev-parse', 'HEAD');
});

afterAll(() => rmSync(folder, { recursive: true, force: true }));

const args = (query: string) => ['-n', '-I', '-i', '-F', '--null', '-e', query, head, '--'];

describe('runGitGrep', () => {
  it('lists matching lines at a commit, ignoring case and binary files', async () => {
    const lines = await runGitGrep(folder, args('needle'), 100);
    expect(lines).toEqual([
      `${head}:src/a.ts\x002\x00const Needle = 1;`,
      `${head}:src/a.ts\x003\x00needle again`,
    ]);
  });

  it('stops after the lines asked for', async () => {
    await expect(runGitGrep(folder, args('needle'), 1)).resolves.toHaveLength(1);
  });

  it('returns nothing when nothing matches', async () => {
    await expect(runGitGrep(folder, args('absent-text'), 100)).resolves.toEqual([]);
  });

  it('fails for a commit that is not there', async () => {
    await expect(
      runGitGrep(folder, ['-n', '-e', 'x', 'f'.repeat(40), '--'], 100),
    ).rejects.toThrow();
  });
});
