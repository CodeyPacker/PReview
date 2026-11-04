import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { setRepositoryAccount } from '../github/repository-accounts.ts';
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

// The service commits as the user. CI machines have no Git identity, so give it one.
process.env.GIT_AUTHOR_NAME = 'Test';
process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
process.env.GIT_COMMITTER_NAME = 'Test';
process.env.GIT_COMMITTER_EMAIL = 'test@example.com';

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

// Windows can still hold a file a git process just closed, so removal retries briefly.
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

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

  it('lists the unpushed changes as diffs, new and binary files too', async () => {
    const service = worktrees();
    const task = addTask();
    await service.open(pullRequestId, head, task);
    const path = join(root, `${repositoryId}-7`);
    writeFileSync(join(path, 'app.txt'), 'fixed\n');
    mkdirSync(join(path, 'docs'));
    writeFileSync(join(path, 'docs', 'notes.md'), 'a\nb\n');
    writeFileSync(join(path, 'logo.bin'), Buffer.from([0, 1, 2]));

    const changes = await service.changes(pullRequestId);

    expect(changes).toEqual([
      {
        path: 'app.txt',
        status: 'modified',
        patch: '@@ -1 +1 @@\n-two\n\\ No newline at end of file\n+fixed',
      },
      { path: 'docs/notes.md', status: 'added', patch: '@@ -0,0 +1,2 @@\n+a\n+b' },
      { path: 'logo.bin', status: 'added', patch: null },
    ]);
  });

  it("doesn't read a new symlink's target, which could be outside the worktree", async () => {
    const service = worktrees();
    await service.open(pullRequestId, head, addTask());
    const path = join(root, `${repositoryId}-7`);
    const outside = join(root, 'secret.txt');
    writeFileSync(outside, 'secret\n');
    symlinkSync(outside, join(path, 'leak.txt'));

    await expect(service.changes(pullRequestId)).resolves.toEqual([
      { path: 'leak.txt', status: 'added', patch: null },
    ]);
  });

  it('has no changes to list when the worktree is gone', async () => {
    await expect(worktrees().changes(pullRequestId)).resolves.toEqual([]);
  });

  describe('publish', () => {
    const remoteHead = () => git(origin, 'rev-parse', 'refs/heads/feature');

    it('commits the changes and pushes them as a fast-forward', async () => {
      const service = worktrees();
      const task = addTask();
      await service.open(pullRequestId, head, task);
      service.release(task);
      writeFileSync(join(root, `${repositoryId}-7`, 'app.txt'), 'fixed');

      const result = await service.publish(pullRequestId, task, 'Address review feedback');

      expect(result).toMatchObject({ status: 'pushed' });
      const sha = (result as { sha: string }).sha;
      expect(remoteHead()).toBe(sha);
      expect(git(origin, 'rev-parse', `${sha}^`)).toBe(head);
      expect(git(origin, 'log', '-1', '--format=%s', sha)).toBe('Address review feedback');
      // The next round starts from the pushed commit.
      await expect(service.open(pullRequestId, sha, addTask())).resolves.toMatchObject({
        status: 'ready',
      });
    });

    it("pushes as the repository's account, for that push only", async () => {
      setRepositoryAccount(db, 'octo/app', 'octo-work', false);
      const real = createGit(30_000);
      const calls: string[][] = [];
      const service = new AgentWorktrees({
        db,
        git: (cwd, args) => {
          calls.push(args);
          return real(cwd, args);
        },
        root,
      });
      const task = addTask();
      await service.open(pullRequestId, head, task);
      service.release(task);
      writeFileSync(join(root, `${repositoryId}-7`, 'app.txt'), 'fixed');

      await expect(service.publish(pullRequestId, task, 'Fix')).resolves.toMatchObject({
        status: 'pushed',
      });

      const push = calls.find((args) => args.includes('push'));
      expect(push).toEqual(
        expect.arrayContaining(['-c', 'credential.https://github.com.username=octo-work']),
      );
      const others = calls.filter((args) => !args.includes('push'));
      expect(others.flat().some((arg) => arg.startsWith('credential.'))).toBe(false);
      // The repository's own config is unchanged.
      expect(() =>
        git(checkout, 'config', '--local', '--get', 'credential.https://github.com.username'),
      ).toThrow();
    });

    it('says so when there is nothing to push', async () => {
      const service = worktrees();
      const task = addTask();
      await service.open(pullRequestId, head, task);
      service.release(task);

      await expect(service.publish(pullRequestId, task, 'Nothing')).resolves.toEqual({
        status: 'no_changes',
      });
      expect(remoteHead()).toBe(head);
    });

    it("doesn't push when the branch moved, and keeps the changes", async () => {
      const service = worktrees();
      const task = addTask();
      await service.open(pullRequestId, head, task);
      service.release(task);
      const path = join(root, `${repositoryId}-7`);
      writeFileSync(join(path, 'app.txt'), 'fixed');
      const moved = pushToBranch('someone else');

      await expect(service.publish(pullRequestId, task, 'Fix')).resolves.toMatchObject({
        status: 'blocked',
        reason: 'The branch has new commits since the review. Review them first.',
      });
      expect(remoteHead()).toBe(moved);
      expect(readFileSync(join(path, 'app.txt'), 'utf8')).toBe('fixed');
    });

    it.skipIf(process.platform === 'win32')(
      'undoes the commit when the push is refused, and keeps the changes',
      async () => {
        const service = worktrees();
        const task = addTask();
        await service.open(pullRequestId, head, task);
        service.release(task);
        const path = join(root, `${repositoryId}-7`);
        writeFileSync(join(path, 'app.txt'), 'fixed');
        const hook = join(origin, 'hooks', 'pre-receive');
        writeFileSync(hook, '#!/bin/sh\necho "protected branch" >&2\nexit 1\n');
        chmodSync(hook, 0o755);

        const result = await service.publish(pullRequestId, task, 'Fix');

        expect(result).toMatchObject({ status: 'blocked' });
        expect((result as { reason: string }).reason).toContain('protected branch');
        expect(git(path, 'rev-parse', 'HEAD')).toBe(head);
        expect(readFileSync(join(path, 'app.txt'), 'utf8')).toBe('fixed');
        expect(remoteHead()).toBe(head);
      },
    );

    it('never pushes to the base branch', async () => {
      db.prepare(`UPDATE pull_requests SET head_branch = 'main' WHERE id = ?`).run(pullRequestId);
      db.prepare(
        `INSERT INTO agent_worktrees (repository_id, number, path, head_branch, head_sha)
         VALUES (?, 7, ?, 'main', ?)`,
      ).run(repositoryId, checkout, head);

      await expect(worktrees().publish(pullRequestId, addTask(), 'Fix')).resolves.toEqual({
        status: 'blocked',
        reason: "PReview doesn't push to main, the base branch.",
      });
    });
  });
});
