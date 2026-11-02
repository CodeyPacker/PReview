import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { Git } from '../repositories/git-info.ts';

export type OpenWorktreeResult =
  | { status: 'ready'; path: string }
  // The agent can't start. reason says why and what to do, and is safe to show.
  | { status: 'blocked'; reason: string };

export interface AgentWorktreesDeps {
  db: DatabaseSync;
  git: Git;
  // The folder that holds every worktree, outside the user's checkouts.
  root: string;
}

// A type, not an interface, so node:sqlite's rows can be read as it.
type WorktreeRow = {
  id: number;
  repository_id: number;
  number: number;
  path: string;
  head_sha: string;
  writer_task_id: number | null;
};

// A worktree whose pull request closed, with its repository's folder.
type ClosedWorktreeRow = WorktreeRow & { repository_path: string };

const blocked = (reason: string): OpenWorktreeResult => ({ status: 'blocked', reason });

// The ref PReview fetches a pull request's branch into, so the user's own refs are untouched.
const pullRef = (number: number) => `refs/preview/pull/${number}`;

// Gives each pull request its own Git worktree for agents to work in. The worktree is on the
// pull request's commit without a branch, so it works even when the user has that branch
// checked out. It is reused across review rounds, never discards changes, and lets only one
// task change it at a time.
export class AgentWorktrees {
  // Pull requests whose worktree is being opened, so two opens never overlap.
  private readonly opening = new Set<string>();

  constructor(private readonly deps: AgentWorktreesDeps) {}

  // Puts the pull request's worktree on headSha and reserves it for taskId.
  async open(pullRequestId: number, headSha: string, taskId: number): Promise<OpenWorktreeResult> {
    const pull = this.findPullRequest(pullRequestId);
    const key = `${pull.repositoryId}:${pull.number}`;
    if (this.opening.has(key)) return blocked('Another agent is working on this pull request.');
    this.opening.add(key);
    try {
      return await this.prepare(pull, headSha, taskId);
    } finally {
      this.opening.delete(key);
    }
  }

  // Frees the worktree the task was working in.
  release(taskId: number): void {
    this.deps.db
      .prepare(
        `UPDATE agent_worktrees SET writer_task_id = NULL, updated_at = ${NOW}
         WHERE writer_task_id = ?`,
      )
      .run(taskId);
  }

  // Removes the worktrees of pull requests that closed. One with changes PReview hasn't
  // saved, or with a task working in it, stays. Resolves with the paths kept.
  async cleanUp(): Promise<string[]> {
    const rows = this.deps.db
      .prepare(
        `SELECT w.*, r.path AS repository_path FROM agent_worktrees w
         JOIN repositories r ON r.id = w.repository_id
         WHERE r.status = 'available' AND NOT EXISTS (
           SELECT 1 FROM pull_requests p
           WHERE p.repository_id = w.repository_id AND p.number = w.number
         )`,
      )
      .all() as ClosedWorktreeRow[];
    const kept: string[] = [];
    for (const row of rows) {
      if (row.writer_task_id !== null || !(await this.removable(row))) {
        kept.push(row.path);
        continue;
      }
      const git = await this.safeGit(row.repository_path);
      if (existsSync(row.path))
        await git(row.repository_path, ['worktree', 'remove', '--force', row.path]);
      await git(row.repository_path, ['worktree', 'prune']);
      await git(row.repository_path, ['update-ref', '-d', pullRef(row.number)]).catch(() => '');
      this.deps.db.prepare('DELETE FROM agent_worktrees WHERE id = ?').run(row.id);
    }
    return kept;
  }

  private async prepare(
    pull: PullRequestRow,
    headSha: string,
    taskId: number,
  ): Promise<OpenWorktreeResult> {
    if (pull.repositoryStatus !== 'available') {
      return blocked('The repository folder is missing. Reconnect it, then try again.');
    }
    const row = this.findWorktree(pull.repositoryId, pull.number);
    if (row && row.writer_task_id !== null && row.writer_task_id !== taskId) {
      return blocked('Another agent is working on this pull request.');
    }

    const git = await this.safeGit(pull.path);
    const ref = pullRef(pull.number);
    await git(pull.path, [
      'fetch',
      '--no-tags',
      '--quiet',
      'origin',
      `+refs/heads/${pull.headBranch}:${ref}`,
    ]);
    if ((await git(pull.path, ['rev-parse', ref])) !== headSha) {
      return blocked('The branch has new commits since the review. Review them first.');
    }

    if (row && existsSync(row.path)) {
      const result = await this.reuse(git, row, headSha);
      if (result.status === 'ready') this.reserve(row.id, taskId);
      return result;
    }
    // The folder was deleted. Git still lists it until pruned.
    if (row) {
      await git(pull.path, ['worktree', 'prune']);
      this.deps.db.prepare('DELETE FROM agent_worktrees WHERE id = ?').run(row.id);
    }
    const path = join(this.deps.root, `${pull.repositoryId}-${pull.number}`);
    if (existsSync(path)) {
      return blocked(`A folder is in the way of the agent's worktree. Move it first: ${path}`);
    }
    await git(pull.path, ['worktree', 'add', '--detach', '--quiet', path, headSha]);
    this.deps.db
      .prepare(
        `INSERT INTO agent_worktrees
           (repository_id, number, path, head_branch, head_sha, writer_task_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(pull.repositoryId, pull.number, path, pull.headBranch, headSha, taskId);
    return { status: 'ready', path };
  }

  // Checks an existing worktree is where PReview left it, then moves it to headSha.
  private async reuse(git: Git, row: WorktreeRow, headSha: string): Promise<OpenWorktreeResult> {
    if (!(await this.untouched(git, row))) {
      return blocked(
        `Someone changed the agent's worktree to another commit or branch. Check it first: ${row.path}`,
      );
    }
    // Unfinished work from an earlier run on this commit is kept for the next run.
    if (row.head_sha === headSha) return { status: 'ready', path: row.path };
    if ((await git(row.path, ['status', '--porcelain'])) !== '') {
      return blocked(
        `The agent's worktree has unsaved changes from an earlier run. Save or discard them first: ${row.path}`,
      );
    }
    await git(row.path, ['checkout', '--detach', '--quiet', headSha]);
    this.deps.db
      .prepare(`UPDATE agent_worktrees SET head_sha = ?, updated_at = ${NOW} WHERE id = ?`)
      .run(headSha, row.id);
    return { status: 'ready', path: row.path };
  }

  // Whether the worktree is still on the commit PReview put it on, without a branch.
  private async untouched(git: Git, row: WorktreeRow): Promise<boolean> {
    const onBranch = await git(row.path, ['symbolic-ref', '-q', 'HEAD']).then(
      () => true,
      () => false,
    );
    return !onBranch && (await git(row.path, ['rev-parse', 'HEAD'])) === row.head_sha;
  }

  // Whether removing the worktree loses nothing: it is gone already, or untouched and clean.
  private async removable(row: ClosedWorktreeRow): Promise<boolean> {
    if (!existsSync(row.path)) return true;
    const git = await this.safeGit(row.repository_path);
    return (
      (await this.untouched(git, row)) && (await git(row.path, ['status', '--porcelain'])) === ''
    );
  }

  private reserve(id: number, taskId: number): void {
    this.deps.db
      .prepare(`UPDATE agent_worktrees SET writer_task_id = ?, updated_at = ${NOW} WHERE id = ?`)
      .run(taskId, id);
  }

  // Git that runs none of the repository's hooks, file monitors or checkout filters, since the
  // pull request's code decides what those are.
  private async safeGit(repositoryPath: string): Promise<Git> {
    const hooks = join(this.deps.root, '.no-hooks');
    await mkdir(hooks, { recursive: true });
    const filters = await this.deps
      .git(repositoryPath, [
        'config',
        '--name-only',
        '--get-regexp',
        '^filter\\..*\\.(clean|smudge|process|required)$',
      ])
      .catch(() => '');
    const flags = [
      '-c',
      `core.hooksPath=${hooks}`,
      '-c',
      'core.fsmonitor=false',
      ...filters
        .split('\n')
        .filter(Boolean)
        .flatMap((key) => ['-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`]),
    ];
    return (cwd, args) => this.deps.git(cwd, [...flags, ...args]);
  }

  private findPullRequest(pullRequestId: number): PullRequestRow {
    const row = this.deps.db
      .prepare(
        `SELECT p.number, p.head_branch, p.repository_id, r.path, r.status
         FROM pull_requests p JOIN repositories r ON r.id = p.repository_id
         WHERE p.id = ?`,
      )
      .get(pullRequestId) as
      | { number: number; head_branch: string; repository_id: number; path: string; status: string }
      | undefined;
    if (!row) throw new Error('Pull request not found.');
    return {
      number: row.number,
      headBranch: row.head_branch,
      repositoryId: row.repository_id,
      path: row.path,
      repositoryStatus: row.status,
    };
  }

  private findWorktree(repositoryId: number, number: number): WorktreeRow | undefined {
    return this.deps.db
      .prepare('SELECT * FROM agent_worktrees WHERE repository_id = ? AND number = ?')
      .get(repositoryId, number) as WorktreeRow | undefined;
  }
}

interface PullRequestRow {
  number: number;
  headBranch: string;
  repositoryId: number;
  path: string;
  repositoryStatus: string;
}

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
