import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { createGit } from '../repositories/git-info.ts';
import { AgentWorktrees } from './worktrees.ts';

let dir: string;
let origin: string;
let checkout: string;
let root: string;
let db: ReturnType<typeof openDatabase>;
let pullRequestId: number;
let repositoryId: number;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

// Pushes a new commit to the pull request's branch from a second clone, as its author would.
function pushToBranch(content: string): string {
  const other = join(dir, `other-${Date.now()}-${Math.random()}`);
  git(dir, 'clone', '-q', '-b', 'feature', origin, other);
  writeFileSync(join(other, 'app.txt'), content);
  git(other, 'commit', '-qam', content);
  git(other, 'push', '-q', 'origin', 'feature');
  return git(other, 'rev-parse', 'HEAD');
}

function addTask(): number {
  const submission = `s-${Math.random()}`;
  db.prepare(
    `INSERT INTO review_submissions
       (id, pull_request_id, head_sha, verdict, body, comments, draft_ids, finding_ids,
        send_to_agent)
     VALUES (?, ?, 'x', 'comment', '', '[]', '[]', '[]', 1)`,
  ).run(submission, pullRequestId);
  return Number(
    db
      .prepare('INSERT INTO agent_tasks (submission_id, pull_request_id) VALUES (?, ?)')
      .run(submission, pullRequestId).lastInsertRowid,
  );
}

let head: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'preview-worktrees-'));
  origin = join(dir, 'origin.git');
  checkout = join(dir, 'checkout');
  root = join(dir, 'worktrees');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, checkout);
  writeFileSync(join(checkout, 'app.txt'), 'one');
  git(checkout, 'add', '.');
  git(checkout, 'commit', '-qm', 'one');
  git(checkout, 'push', '-q', 'origin', 'HEAD:main');
  // The user's checkout is on the pull request's branch, as it often is for their own work.
  git(checkout, 'switch', '-q', '-c', 'feature');
  writeFileSync(join(checkout, 'app.txt'), 'two');
  git(checkout, 'commit', '-qam', 'two');
  git(checkout, 'push', '-q', '-u', 'origin', 'feature');
  head = git(checkout, 'rev-parse', 'HEAD');

  db = openDatabase(':memory:');
  migrate(db);
  repositoryId = Number(
    db
      .prepare(
        `INSERT INTO repositories (path, name, github_owner, github_name, status)
         VALUES (?, 'app', 'octo', 'app', 'available')`,
      )
      .run(checkout).lastInsertRowid,
  );
  pullRequestId = Number(
    db
      .prepare(
        `INSERT INTO pull_requests
           (repository_id, provider_id, number, title, draft, url, head_branch, head_sha,
            base_branch, created_at, updated_at)
         VALUES (?, '10', 7, 'Title', 0, 'https://example.test/7', 'feature', ?, 'main', 'a', 'b')`,
      )
      .run(repositoryId, head).lastInsertRowid,
  );
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const worktrees = () => new AgentWorktrees({ db, git: createGit(30_000), root });

describe('AgentWorktrees', () => {
  it('opens a worktree on the reviewed commit, outside the checkout, without a branch', async () => {
    const result = await worktrees().open(pullRequestId, head, addTask());

    expect(result).toEqual({ status: 'ready', path: join(root, `${repositoryId}-7`) });
    const path = join(root, `${repositoryId}-7`);
    expect(git(path, 'rev-parse', 'HEAD')).toBe(head);
    expect(() => git(path, 'symbolic-ref', '-q', 'HEAD')).toThrow();
    expect(git(checkout, 'branch', '--show-current')).toBe('feature');
  });

  it('refuses when the branch moved past the reviewed commit', async () => {
    pushToBranch('three');

    await expect(worktrees().open(pullRequestId, head, addTask())).resolves.toEqual({
      status: 'blocked',
      reason: 'The branch has new commits since the review. Review them first.',
    });
  });

  it('moves a clean worktree to the next reviewed commit', async () => {
    const service = worktrees();
    const task = addTask();
    await service.open(pullRequestId, head, task);
    service.release(task);
    const next = pushToBranch('three');

    const result = await service.open(pullRequestId, next, addTask());

    expect(result.status).toBe('ready');
    expect(git(join(root, `${repositoryId}-7`), 'rev-parse', 'HEAD')).toBe(next);
  });

  it('keeps unfinished changes on the same commit, and refuses to move past them', async () => {
    const service = worktrees();
    const task = addTask();
    await service.open(pullRequestId, head, task);
    service.release(task);
    const path = join(root, `${repositoryId}-7`);
    writeFileSync(join(path, 'app.txt'), 'unfinished');

    await expect(service.open(pullRequestId, head, addTask())).resolves.toMatchObject({
      status: 'ready',
    });
    expect(readFileSync(join(path, 'app.txt'), 'utf8')).toBe('unfinished');

    service.release(task + 1);
    const next = pushToBranch('three');
    await expect(service.open(pullRequestId, next, addTask())).resolves.toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('unsaved changes') as string,
    });
    expect(readFileSync(join(path, 'app.txt'), 'utf8')).toBe('unfinished');
  });

  it('refuses a worktree someone moved to a branch', async () => {
    const service = worktrees();
    const task = addTask();
    await service.open(pullRequestId, head, task);
    service.release(task);
    git(join(root, `${repositoryId}-7`), 'switch', '-q', '-c', 'mine');

    await expect(service.open(pullRequestId, head, addTask())).resolves.toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('another commit or branch') as string,
    });
  });

  it('lets one task at a time work in a worktree', async () => {
    const service = worktrees();
    const first = addTask();
    const second = addTask();
    await service.open(pullRequestId, head, first);

    await expect(service.open(pullRequestId, head, second)).resolves.toEqual({
      status: 'blocked',
      reason: 'Another agent is working on this pull request.',
    });
    service.release(first);
    await expect(service.open(pullRequestId, head, second)).resolves.toMatchObject({
      status: 'ready',
    });
  });

  it('recreates a worktree whose folder was deleted', async () => {
    const service = worktrees();
    const task = addTask();
    await service.open(pullRequestId, head, task);
    service.release(task);
    rmSync(join(root, `${repositoryId}-7`), { recursive: true, force: true });

    await expect(service.open(pullRequestId, head, addTask())).resolves.toMatchObject({
      status: 'ready',
    });
    expect(git(join(root, `${repositoryId}-7`), 'rev-parse', 'HEAD')).toBe(head);
  });

  it.skipIf(process.platform === 'win32')("doesn't run the repository's hooks", async () => {
    const marker = join(dir, 'hook-ran');
    const hook = join(checkout, '.git', 'hooks', 'post-checkout');
    writeFileSync(hook, `#!/bin/sh\ntouch "${marker}"\n`);
    chmodSync(hook, 0o755);

    await worktrees().open(pullRequestId, head, addTask());

    expect(existsSync(marker)).toBe(false);
  });

  it('removes the worktree of a closed pull request, unless it has unsaved changes', async () => {
    const service = worktrees();
    const task = addTask();
    await service.open(pullRequestId, head, task);
    service.release(task);
    const path = join(root, `${repositoryId}-7`);
    writeFileSync(join(path, 'app.txt'), 'unfinished');
    db.prepare('DELETE FROM pull_requests WHERE id = ?').run(pullRequestId);

    await expect(service.cleanUp()).resolves.toEqual([path]);
    expect(existsSync(path)).toBe(true);

    git(path, 'checkout', '-q', '--', 'app.txt');
    await expect(service.cleanUp()).resolves.toEqual([]);
    expect(existsSync(path)).toBe(false);
    expect(db.prepare('SELECT * FROM agent_worktrees').all()).toEqual([]);
  });
});
