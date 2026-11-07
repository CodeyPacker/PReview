import { mkdtempSync, rmSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import type { AgentRunInput, AgentRunResult, AgentReport } from '../../agents/provider.ts';
import type { GitProvider } from '../../providers/types.ts';
import { listActivity, listAgentTasks, moveQueuedTask } from './activity.ts';
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

  it('fails at once when trying again cannot help, and tells the user', async () => {
    const { runner, runs, notify } = setup();
    const id = addTask(addPullRequest(7));

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    runs[0]!.finish({ status: 'failed', error: 'Not signed in.', retryable: false });

    await vi.waitFor(() => expect(task(id).status).toBe('failed'));
    expect(task(id).attempts).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      'An agent run failed',
      expect.stringContaining('Not signed in.'),
    );
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
    const { runner, runs } = setup({ limit: () => 1 });
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

  it('starts queued tasks in the order the user moved them to', async () => {
    const { runner, runs } = setup({ limit: () => 1 });
    const first = addTask(addPullRequest(7));
    const second = addTask(addPullRequest(8));
    const third = addTask(addPullRequest(9));

    moveQueuedTask(db, third, 'up');
    moveQueuedTask(db, third, 'up');
    expect(listAgentTasks(db).find(({ id }) => id === third)?.queue).toEqual({
      position: 1,
      total: 3,
    });
    expect(listAgentTasks(db).find(({ id }) => id === second)?.queue).toEqual({
      position: 3,
      total: 3,
    });
    // Already first, so this changes nothing.
    moveQueuedTask(db, third, 'up');

    runner.wake();
    await vi.waitFor(() => expect(task(third).status).toBe('running'));
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(task(first).status).toBe('queued');
    runs[0]!.finish({ status: 'completed', report, costUsd: 0 });
    await vi.waitFor(() => expect(task(first).status).toBe('running'));
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    expect(task(second).status).toBe('queued');
    expect(listAgentTasks(db).find(({ id }) => id === first)?.queue).toBeNull();
    runs[1]!.finish({ status: 'completed', report, costUsd: 0 });
    await vi.waitFor(() => expect(task(second).status).toBe('running'));
    await vi.waitFor(() => expect(runs).toHaveLength(3));
    runs[2]!.finish({ status: 'completed', report, costUsd: 0 });
    await vi.waitFor(() => expect(task(second).status).toBe('completed'));
  });

  it('starts more tasks when the limit is raised', async () => {
    let limit = 1;
    const { runner, runs } = setup({ limit: () => limit });
    addTask(addPullRequest(1));
    addTask(addPullRequest(2));

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    limit = 2;
    runner.wake();

    await vi.waitFor(() => expect(runs).toHaveLength(2));
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

  it('records its steps in the activity feed', async () => {
    const { runner, runs } = setup();
    const id = addTask(addPullRequest(7));

    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    runs[0]!.input.onActivity({ kind: 'file', summary: 'Edited src/app.ts' });
    runs[0]!.input.onActivity({
      kind: 'test',
      summary: 'Tests passed',
      detail: 'token ghp_abcdefghijklmnopqrstuvwxyz0123',
    });
    runs[0]!.finish({ status: 'completed', report, costUsd: null });

    await vi.waitFor(() => expect(task(id).status).toBe('completed'));
    expect(listActivity(db, id).map(({ kind, summary }) => [kind, summary])).toEqual([
      ['status', 'Started working'],
      ['file', 'Edited src/app.ts'],
      ['test', 'Tests passed'],
      ['status', 'Finished. Fixed the comment.'],
    ]);
    expect(listActivity(db, id)[2]!.detail).toBe('token [REDACTED]');
  });

  const question = [
    { question: 'Keep the old endpoint?', header: 'API', options: [], multiSelect: false },
  ];

  it('waits for the answer to a question and passes it to the agent', async () => {
    const { runner, runs, notify } = setup();
    const id = addTask(addPullRequest(7));
    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));

    const answer = runs[0]!.input.ask(question, new AbortController().signal);
    const [waiting] = listAgentTasks(db);
    expect(waiting).toMatchObject({ status: 'waiting', question: { questions: question } });
    expect(notify).toHaveBeenCalledWith(
      'An agent has a question',
      'On "Title": Keep the old endpoint?',
    );

    expect(runner.answer(waiting!.question!.id, { 'Keep the old endpoint?': 'Yes' })).toBe(true);
    await expect(answer).resolves.toEqual({ 'Keep the old endpoint?': 'Yes' });
    expect(task(id).status).toBe('running');
    expect(listAgentTasks(db)[0]!.question).toBeNull();
    expect(runner.answer(waiting!.question!.id, { 'Keep the old endpoint?': 'No' })).toBe(false);
  });

  it('withdraws a question when the task stops', async () => {
    const { runner, runs } = setup();
    const id = addTask(addPullRequest(7));
    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    const abort = new AbortController();
    const answer = runs[0]!.input.ask(question, abort.signal);

    abort.abort();

    await expect(answer).resolves.toBeNull();
    expect(listAgentTasks(db).find((item) => item.id === id)!.question).toBeNull();
  });

  it('resumes the session with the answer when the app restarted while waiting', async () => {
    const { runner, runs } = setup();
    const id = addTask(addPullRequest(7));
    db.prepare(`UPDATE agent_tasks SET status = 'waiting', session_id = 'S1' WHERE id = ?`).run(id);
    const questionId = Number(
      db
        .prepare('INSERT INTO agent_questions (task_id, questions) VALUES (?, ?)')
        .run(id, JSON.stringify(question)).lastInsertRowid,
    );
    runner.recover();
    runner.wake();
    expect(task(id).status).toBe('waiting');

    runner.answer(questionId, { 'Keep the old endpoint?': 'Yes' });

    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0]!.input).toMatchObject({ resume: true, sessionId: 'S1' });
    expect(runs[0]!.input.prompt).toContain('Question: Keep the old endpoint?\nAnswer: Yes');
  });

  it('stops a task the app restarted while it waited', async () => {
    const { runner } = setup();
    const id = addTask(addPullRequest(7));
    db.prepare(`UPDATE agent_tasks SET status = 'waiting' WHERE id = ?`).run(id);
    db.prepare('INSERT INTO agent_questions (task_id, questions) VALUES (?, ?)').run(
      id,
      JSON.stringify(question),
    );

    await runner.stop(id);

    expect(task(id).status).toBe('stopped');
    expect(listAgentTasks(db)[0]!.question).toBeNull();
  });

  it('hands a completed run to be pushed', async () => {
    const onCompleted = vi.fn();
    const { runner, runs } = setup({ onCompleted });
    const id = addTask(addPullRequest(7));
    runner.wake();
    await vi.waitFor(() => expect(runs).toHaveLength(1));

    runs[0]!.finish({ status: 'completed', report, costUsd: null });

    await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(id, report));
  });

  it('sends the agent back at the pushed commit when the user asks about failed CI', async () => {
    const { runner, runs, worktrees } = setup();
    const id = addTask(addPullRequest(7));
    db.prepare(
      `UPDATE agent_tasks
       SET status = 'completed', session_id = 'S1', pushed_sha = 'pushed', ci_status = 'failed',
           ci_checks = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify([
        { name: 'test', required: true, state: 'failed', url: 'https://ci.test/1' },
        { name: 'lint', required: false, state: 'passed', url: null },
      ]),
      id,
    );

    runner.investigate(id);

    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(worktrees.open).toHaveBeenCalledWith(expect.any(Number), 'pushed', id);
    expect(runs[0]!.input).toMatchObject({ resume: true, sessionId: 'S1' });
    expect(runs[0]!.input.prompt).toContain('- test (https://ci.test/1)');
    expect(runs[0]!.input.prompt).not.toContain('lint');
  });

  it("doesn't send the agent back when CI didn't fail", () => {
    const { runner, start } = setup();
    const id = addTask(addPullRequest(7));
    db.prepare(
      `UPDATE agent_tasks SET status = 'completed', ci_status = 'passed' WHERE id = ?`,
    ).run(id);

    runner.investigate(id);

    expect(task(id).status).toBe('completed');
    expect(start).not.toHaveBeenCalled();
  });
});

describe('package cache cleanup', () => {
  it('refuses cleanup while a task is starting or running', async () => {
    const { runner, runs } = setup();
    addTask(addPullRequest(1));
    const clear = vi.fn().mockResolvedValue(undefined);
    runner.wake();
    await expect(runner.clearPackageCache(clear)).resolves.toEqual({ status: 'busy' });
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    await expect(runner.clearPackageCache(clear)).resolves.toEqual({ status: 'busy' });
    expect(clear).not.toHaveBeenCalled();
    runs[0]!.finish({ status: 'completed', report, costUsd: null });
    await vi.waitFor(() => expect(runner.busy).toBe(false));
  });

  it.each([false, true])(
    'holds queued tasks and releases them after cleanup (failure %s)',
    async (fail) => {
      const { runner, runs } = setup();
      let finish: () => void = () => {};
      let failCleanup: (error: Error) => void = () => {};
      const deletion = new Promise<void>((resolve, reject) => {
        finish = resolve;
        failCleanup = reject;
      });
      const cleanup = runner.clearPackageCache(() => deletion);
      const assertion = fail
        ? expect(cleanup).rejects.toThrow('Delete failed')
        : expect(cleanup).resolves.toEqual({ status: 'cleared' });
      const id = addTask(addPullRequest(1));
      runner.wake();
      expect(task(id).status).toBe('queued');
      const otherClear = vi.fn().mockResolvedValue(undefined);
      await expect(runner.clearPackageCache(otherClear)).resolves.toEqual({ status: 'busy' });
      expect(otherClear).not.toHaveBeenCalled();
      if (fail) failCleanup(new Error('Delete failed'));
      else finish();
      await assertion;
      await vi.waitFor(() => expect(runs).toHaveLength(1));
      runs[0]!.finish({ status: 'completed', report, costUsd: null });
      await vi.waitFor(() => expect(runner.busy).toBe(false));
    },
  );
});
