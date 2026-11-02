import { mkdtempSync, rmSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import type { AgentRunInput, AgentRunResult, AgentReport } from '../../agents/provider.ts';
import type { GitProvider } from '../../providers/types.ts';
import { AgentRunner, type AgentRunnerDeps } from './runner.ts';
import type { OpenWorktreeResult } from './worktrees.ts';

let db: ReturnType<typeof openDatabase>;
let dir: string;
let repositoryId: number;

const report: AgentReport = {
  items: [{ id: 'C1', outcome: 'fixed', note: 'Renamed it.' }],
  tests: [{ command: 'pnpm test', passed: true, summary: 'All pass.' }],
  summary: 'Fixed the comment.',
};

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'preview-runner-')));
  db = openDatabase(':memory:');
  migrate(db);
  repositoryId = Number(
    db
      .prepare(
        `INSERT INTO repositories (path, name, github_owner, github_name, status)
         VALUES ('/code/app', 'app', 'octo', 'app', 'available')`,
      )
      .run().lastInsertRowid,
  );
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function addPullRequest(number: number): number {
  return Number(
    db
      .prepare(
        `INSERT INTO pull_requests
           (repository_id, provider_id, number, title, draft, url, head_branch, head_sha,
            base_branch, created_at, updated_at)
         VALUES (?, ?, ?, 'Title', 0, 'https://example.test', 'feature', 'abc', 'main', 'a', 'b')`,
      )
      .run(repositoryId, String(number), number).lastInsertRowid,
  );
}

function addTask(pullRequestId: number): number {
  const submission = `s-${Math.random()}`;
  db.prepare(
    `INSERT INTO review_submissions
       (id, pull_request_id, head_sha, verdict, body, comments, draft_ids, finding_ids,
        send_to_agent)
     VALUES (?, ?, 'abc', 'comment', 'Notes.', ?, '[]', '[]', 1)`,
  ).run(
    submission,
    pullRequestId,
    JSON.stringify([
      { path: 'src/app.ts', side: 'modified', startLine: null, line: 3, body: 'Rename.' },
    ]),
  );
  return Number(
    db
      .prepare('INSERT INTO agent_tasks (submission_id, pull_request_id) VALUES (?, ?)')
      .run(submission, pullRequestId).lastInsertRowid,
  );
}

const task = (id: number) =>
  db
    .prepare('SELECT status, attempts, error, result, session_id FROM agent_tasks WHERE id = ?')
    .get(id) as {
    status: string;
    attempts: number;
    error: string | null;
    result: string | null;
    session_id: string | null;
  };

function setup(overrides: Partial<AgentRunnerDeps> = {}) {
  const runs: { input: AgentRunInput; finish: (result: AgentRunResult) => void }[] = [];
  const start = vi.fn((input: AgentRunInput) => {
    let finish: (result: AgentRunResult) => void = () => {};
    const result = new Promise<AgentRunResult>((resolve) => (finish = resolve));
    runs.push({ input, finish });
    return Promise.resolve({
      result,
      stop: vi.fn(() => {
        finish({ status: 'stopped' });
        return Promise.resolve();
      }),
      forceStop: vi.fn(() => finish({ status: 'stopped' })),
    });
  });
  const open = vi
    .fn<(id: number, sha: string, task: number) => Promise<OpenWorktreeResult>>()
    .mockResolvedValue({ status: 'ready', path: dir });
  const worktrees = { open, release: vi.fn(), releaseAll: vi.fn() };
  const provider = {
    getPullRequestDetails: vi.fn().mockResolvedValue({
      description: '',
      files: [
        {
          path: 'src/app.ts',
          previousPath: null,
          status: 'modified',
          additions: 1,
          deletions: 1,
          patch: '@@ -1 +1 @@\n-a\n+b',
        },
      ],
    }),
    getReviewThreads: vi.fn().mockResolvedValue([]),
  } as unknown as GitProvider;
  const notify = vi.fn();
  const runner = new AgentRunner({
    db,
    provider,
    agent: { start },
    worktrees,
    notify,
    log: { warn: vi.fn() },
    ...overrides,
  });
  return { runner, runs, start, worktrees, notify };
}

describe('AgentRunner', () => {
  it('runs a queued task in its worktree and saves the report', async () => {
    const { runner, runs, worktrees } = setup();
    const id = addTask(addPullRequest(7));

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0]!.input).toMatchObject({ worktree: dir, resume: false });
    expect(runs[0]!.input.prompt).toContain('C1. src/app.ts, line 3');
    expect(runs[0]!.input.getFileDiff('src/app.ts')).toContain('+b');
    expect(task(id)).toMatchObject({ status: 'running', attempts: 1 });
    runs[0]!.finish({ status: 'completed', report, costUsd: 0.12 });

    await vi.waitFor(() => expect(task(id).status).toBe('completed'));
    expect(JSON.parse(task(id).result!)).toEqual(report);
    expect(worktrees.release).toHaveBeenCalledWith(id);
  });

  it('runs two tasks at once and starts the next when one finishes', async () => {
    const { runner, runs } = setup();
    const ids = [
      addTask(addPullRequest(1)),
      addTask(addPullRequest(2)),
      addTask(addPullRequest(3)),
    ];

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    expect(task(ids[2]!).status).toBe('queued');
    runs[0]!.finish({ status: 'completed', report, costUsd: null });

    await vi.waitFor(() => expect(runs).toHaveLength(3));
    expect(task(ids[2]!).status).toBe('running');
  });

  it('runs one task per pull request at a time', async () => {
    const { runner, runs } = setup();
    const pullRequestId = addPullRequest(7);
    const first = addTask(pullRequestId);
    const second = addTask(pullRequestId);

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(task(second).status).toBe('queued');
    runs[0]!.finish({ status: 'completed', report, costUsd: null });

    await vi.waitFor(() => expect(runs).toHaveLength(2));
    expect(task(first).status).toBe('completed');
  });

  it('retries a failed run twice, then waits for the user', async () => {
    const { runner, runs } = setup();
    const id = addTask(addPullRequest(7));

    runner.wake();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await vi.waitFor(() => expect(runs).toHaveLength(attempt));
      runs[attempt - 1]!.finish({ status: 'failed', error: 'Lost connection.', retryable: true });
    }

    await vi.waitFor(() => expect(task(id).status).toBe('failed'));
    expect(task(id)).toMatchObject({ attempts: 3, error: 'Lost connection.' });
    expect(runs).toHaveLength(3);
  });

  it('fails at once when trying again cannot help', async () => {
    const { runner, runs } = setup();
    const id = addTask(addPullRequest(7));

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    runs[0]!.finish({ status: 'failed', error: 'Not signed in.', retryable: false });

    await vi.waitFor(() => expect(task(id).status).toBe('failed'));
    expect(task(id).attempts).toBe(1);
  });

  it("fails without starting the agent when the worktree can't be used", async () => {
    const { runner, start, worktrees } = setup();
    worktrees.open.mockResolvedValue({ status: 'blocked', reason: 'Unsaved changes.' });
    const id = addTask(addPullRequest(7));

    runner.wake();

    await vi.waitFor(() =>
      expect(task(id)).toMatchObject({ status: 'failed', error: 'Unsaved changes.' }),
    );
    expect(start).not.toHaveBeenCalled();
  });

  it('stops a running task, and a queued one', async () => {
    const { runner, runs } = setup({ limit: 1 });
    const running = addTask(addPullRequest(1));
    const queued = addTask(addPullRequest(2));

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    await runner.stop(queued);
    await runner.stop(running);

    await vi.waitFor(() => expect(task(running).status).toBe('stopped'));
    expect(task(queued).status).toBe('stopped');
    expect(runs).toHaveLength(1);
  });

  it('resumes a stopped task in its saved session, with fresh retries', async () => {
    const { runner, runs } = setup();
    const id = addTask(addPullRequest(7));
    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    await runner.stop(id);
    await vi.waitFor(() => expect(task(id).status).toBe('stopped'));

    runner.resume(id);

    await vi.waitFor(() => expect(runs).toHaveLength(2));
    expect(runs[1]!.input).toMatchObject({ resume: true, sessionId: runs[0]!.input.sessionId });
    expect(task(id).attempts).toBe(1);
  });

  it('resumes the saved session of a task a crash left running', async () => {
    const { runner, runs, worktrees } = setup();
    const id = addTask(addPullRequest(7));
    db.prepare(
      `UPDATE agent_tasks SET status = 'running', attempts = 1, session_id = 'S1' WHERE id = ?`,
    ).run(id);

    runner.recover();
    runner.wake();

    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(worktrees.releaseAll).toHaveBeenCalled();
    expect(runs[0]!.input).toMatchObject({ resume: true, sessionId: 'S1' });
    expect(runs[0]!.input.prompt).toBe('Continue the task where you left off.');
  });

  it('starts a fresh session after a resumed run fails', async () => {
    const { runner, runs } = setup();
    const id = addTask(addPullRequest(7));
    db.prepare(`UPDATE agent_tasks SET session_id = 'S1' WHERE id = ?`).run(id);

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    runs[0]!.finish({ status: 'failed', error: 'No such session.', retryable: true });

    await vi.waitFor(() => expect(runs).toHaveLength(2));
    expect(runs[1]!.input.resume).toBe(false);
    expect(runs[1]!.input.prompt).toContain('An earlier attempt may have left changes');
  });

  it('tells the user when a run goes long', async () => {
    const { runner, runs, notify } = setup({ longRunMs: 5 });
    addTask(addPullRequest(7));

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));

    await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
  });

  it('keeps tasks running in the database when the app quits', async () => {
    const { runner, runs } = setup();
    const id = addTask(addPullRequest(7));
    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));

    runner.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(task(id).status).toBe('running');
  });
});
