import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { AgentChange } from '../../../shared/contracts/agent-tasks.ts';
import { isGitHubLogin } from '../github/credential-store.ts';
import type { Git } from '../repositories/git-info.ts';

export type OpenWorktreeResult =
  | { status: 'ready'; path: string }
  // The agent can't start. reason says why and what to do, and is safe to show.
  | { status: 'blocked'; reason: string };

export type PublishResult =
  | { status: 'pushed'; sha: string }
  | { status: 'no_changes' }
  // reason says what went wrong and what to do, and is safe to show.
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

  // Commits the worktree's changes and pushes them to the pull request's branch. Only a
  // fast-forward from the commit PReview put the worktree on: if the branch moved, nothing is
  // pushed. A failed push undoes the commit and keeps the changes.
  async publish(pullRequestId: number, taskId: number, message: string): Promise<PublishResult> {
    const pull = this.findPullRequest(pullRequestId);
    const row = this.findWorktree(pull.repositoryId, pull.number);
    if (!row || !existsSync(row.path)) {
      return {
        status: 'blocked',
        reason: "The agent's worktree is gone, so there is nothing to push.",
      };
    }
    if (pull.headBranch === pull.baseBranch) {
      return {
        status: 'blocked',
        reason: `PReview doesn't push to ${pull.baseBranch}, the base branch.`,
      };
    }
    const opened = await this.open(pullRequestId, row.head_sha, taskId);
    if (opened.status === 'blocked') return opened;
    try {
      const git = await this.safeGit(pull.path);
      if ((await git(row.path, ['status', '--porcelain'])) === '') return { status: 'no_changes' };
      await git(row.path, ['add', '--all']);
      try {
        await git(row.path, ['commit', '--quiet', '-m', message]);
      } catch (error) {
        await git(row.path, ['reset', '--quiet']).catch(() => '');
        return { status: 'blocked', reason: `Git could not commit: ${messageOf(error)}` };
      }
      const sha = await git(row.path, ['rev-parse', 'HEAD']);
      // The push goes out as the repository's account: Git's credential helper picks the saved
      // sign-in for this user name. Set for this command only, so no Git config changes.
      const login = pull.account;
      const asAccount = login ? ['-c', `credential.https://github.com.username=${login}`] : [];
      try {
        await git(row.path, [
          ...asAccount,
          'push',
          '--quiet',
          'origin',
          `HEAD:refs/heads/${pull.headBranch}`,
        ]);
      } catch (error) {
        await git(row.path, ['reset', '--soft', '--quiet', row.head_sha]);
        const hint = login
          ? ` If Git has no saved sign-in for @${login}, push once from a terminal as that account.`
          : '';
        return { status: 'blocked', reason: `The push was refused: ${messageOf(error)}${hint}` };
      }
      this.deps.db
        .prepare(`UPDATE agent_worktrees SET head_sha = ?, updated_at = ${NOW} WHERE id = ?`)
        .run(sha, row.id);
      return { status: 'pushed', sha };
    } finally {
      this.release(taskId);
    }
  }

  // The changes in the pull request's worktree that aren't pushed yet. Empty when it has none
  // or is gone.
  async changes(pullRequestId: number): Promise<AgentChange[]> {
    const pull = this.findPullRequest(pullRequestId);
    const row = this.findWorktree(pull.repositoryId, pull.number);
    if (!row || !existsSync(row.path)) return [];
    const git = await this.safeGit(pull.path);
    // Agents can't stage, so the index matches HEAD and nothing shows as renamed.
    const tracked = await git(row.path, ['diff', '--name-status', '-z', 'HEAD']);
    const untracked = await git(row.path, ['ls-files', '--others', '--exclude-standard', '-z']);
    const changes: AgentChange[] = [];
    const fields = tracked.split('\0').filter(Boolean);
    for (let index = 0; index + 1 < fields.length; index += 2) {
      const [letter, path] = [fields[index]!, fields[index + 1]!];
      const patch = await git(row.path, [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        'HEAD',
        '--',
        path,
      ]);
      changes.push({
        path,
        status: letter === 'D' ? 'deleted' : letter === 'A' ? 'added' : 'modified',
        patch: /^Binary files /m.test(patch) ? null : clipPatch(hunksOf(patch)),
      });
    }
    for (const path of untracked.split('\0').filter(Boolean)) {
      changes.push({ path, status: 'added', patch: await newFilePatch(join(row.path, path)) });
    }
    return changes;
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

  // Frees every worktree. At startup no task is running, so none is in use.
  releaseAll(): void {
    this.deps.db
      .prepare(
        `UPDATE agent_worktrees SET writer_task_id = NULL, updated_at = ${NOW}
         WHERE writer_task_id IS NOT NULL`,
      )
      .run();
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
        `SELECT p.number, p.head_branch, p.base_branch, p.repository_id, r.path, r.status,
                a.login AS account
         FROM pull_requests p JOIN repositories r ON r.id = p.repository_id
         LEFT JOIN github_repository_accounts a
           ON a.full_name = r.github_owner || '/' || r.github_name
         WHERE p.id = ?`,
      )
      .get(pullRequestId) as
      | {
          number: number;
          head_branch: string;
          base_branch: string;
          repository_id: number;
          path: string;
          status: string;
          account: string | null;
        }
      | undefined;
    if (!row) throw new Error('Pull request not found.');
    return {
      number: row.number,
      headBranch: row.head_branch,
      baseBranch: row.base_branch,
      repositoryId: row.repository_id,
      path: row.path,
      repositoryStatus: row.status,
      // Only a real GitHub login goes into the Git command.
      account: row.account && isGitHubLogin(row.account) ? row.account : null,
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
  baseBranch: string;
  repositoryId: number;
  path: string;
  repositoryStatus: string;
  // The GitHub account assigned to the repository, which pushes go out as.
  account: string | null;
}

// Git's own message, without the command line execFile adds. A remote's explanation, such as
// GitHub refusing a push to a protected branch, comes first.
const messageOf = (error: unknown) => {
  const raw =
    error instanceof Error
      ? ((error as { stderr?: string }).stderr ?? error.message)
      : String(error);
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const remote = lines.filter((line) => line.startsWith('remote:') || line.startsWith('!'));
  return (remote.length > 0 ? remote : lines.slice(-3)).join(' ');
};

// Diffs past this many characters are cut short, to keep the app responsive.
const MAX_PATCH = 50_000;

const clipPatch = (patch: string) =>
  patch.length > MAX_PATCH ? `${patch.slice(0, MAX_PATCH)}\n… (cut short)` : patch;

// A diff's hunks, without the file header lines above the first @@.
const hunksOf = (patch: string) => {
  const start = patch.search(/^@@/m);
  return start === -1 ? '' : patch.slice(start);
};

// A new file as one hunk of added lines. Null when it is binary.
async function newFilePatch(path: string): Promise<string | null> {
  const content = await readFile(path).catch(() => null);
  if (content?.includes(0)) return null;
  if (!content?.length) return '';
  const lines = content.toString('utf8').replace(/\n$/, '').split('\n');
  return clipPatch(`@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}`);
}

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
