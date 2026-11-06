import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentCheck, AgentReport } from '../../../shared/contracts/agent-tasks.ts';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import type { GitProvider } from '../../providers/types.ts';
import { listActivity, listAgentTasks } from './activity.ts';
import { AgentPublisher, checksOutcome, commitMessage } from './publisher.ts';
import type { PublishResult } from './worktrees.ts';

let db: ReturnType<typeof openDatabase>;
let taskId: number;

const report = (passed: boolean[]): AgentReport => ({
  items: [
    { id: 'C1', outcome: 'fixed', note: 'Renamed it.' },
    { id: 'F1', outcome: 'needs_input', note: 'Which limit?' },
  ],
  tests: passed.map((ok, index) => ({ command: `test ${index}`, passed: ok, summary: '' })),
  summary: 'Renamed the store.',
});

const check = (name: string, state: AgentCheck['state'], required = false): AgentCheck => ({
  name,
  state,
  required,
  url: null,
});

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  const repositoryId = Number(
    db
      .prepare(
        `INSERT INTO repositories (path, name, github_owner, github_name, status)
         VALUES ('/code/app', 'app', 'octo', 'app', 'available')`,
      )
      .run().lastInsertRowid,
  );
  const pullRequestId = Number(
    db
      .prepare(
        `INSERT INTO pull_requests
           (repository_id, provider_id, number, title, draft, url, head_branch, head_sha,
            base_branch, created_at, updated_at)
         VALUES (?, '1', 7, 'Add login', 0, 'u', 'feature', 'abc', 'main', 'a', 'b')`,
      )
      .run(repositoryId).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO review_submissions
       (id, pull_request_id, head_sha, verdict, body, comments, draft_ids, finding_ids,
        send_to_agent)
     VALUES ('s', ?, 'abc', 'comment', '', '[]', '[]', '[]', 1)`,
  ).run(pullRequestId);
  taskId = Number(
    db
      .prepare(
        `INSERT INTO agent_tasks (submission_id, pull_request_id, status, result)
         VALUES ('s', ?, 'completed', ?)`,
      )
      .run(pullRequestId, JSON.stringify(report([true]))).lastInsertRowid,
  );
});

function setup(
  result: PublishResult = { status: 'pushed', sha: 'f'.repeat(40) },
  changes: unknown[] = [],
) {
  const publish = vi.fn().mockResolvedValue(result);
  const getChecks = vi.fn<GitProvider['getChecks']>().mockResolvedValue([]);
  const notify = vi.fn();
  let now = Date.now();
  const publisher = new AgentPublisher({
    db,
    provider: { getChecks } as unknown as GitProvider,
    worktrees: { publish, changes: vi.fn().mockResolvedValue(changes) },
    notify,
    log: { warn: vi.fn() },
    noChecksMs: 1000,
    now: () => now,
  });
  return { publisher, publish, getChecks, notify, later: (ms: number) => (now += ms) };
}

const latest = () => listAgentTasks(db)[0]!;

describe('AgentPublisher', () => {
  it('pushes right away when every reported test passed', async () => {
    const { publisher, publish } = setup();

    await publisher.afterRun(taskId, report([true, true]));

    expect(publish).toHaveBeenCalledWith(expect.any(Number), taskId, expect.any(String));
    expect(latest()).toMatchObject({
      push: { status: 'pushed', sha: 'f'.repeat(40) },
      ci: { status: 'pending' },
    });
  });

  it.each([
    ['a test failed', [true, false]],
    ['no tests were reported', []],
  ])('still pushes when %s', async (_case, passed) => {
    const { publisher, publish } = setup();

    await publisher.afterRun(taskId, report(passed));

    expect(publish).toHaveBeenCalledTimes(1);
    expect(latest().push?.status).toBe('pushed');
  });

  it('only says it is pushing past a failed test when there is something to push', async () => {
    const note = 'A test failed in the agent’s sandbox. Pushing anyway, so CI can check it.';
    const notes = () => listActivity(db, taskId).map(({ summary }) => summary);

    await setup({ status: 'no_changes' }).publisher.afterRun(taskId, report([false]));
    expect(notes()).not.toContain(note);

    await setup(undefined, [{ path: 'a.ts' }]).publisher.afterRun(taskId, report([false]));
    expect(notes()).toContain(note);
  });

  it('records a refused push and why', async () => {
    const { publisher } = setup({ status: 'blocked', reason: 'Protected branch.' });

    await publisher.push(taskId);

    expect(latest().push).toEqual({ status: 'blocked', sha: null, error: 'Protected branch.' });
    expect(listActivity(db, taskId).at(-1)).toMatchObject({
      kind: 'error',
      detail: 'Protected branch.',
    });
  });

  it('marks the pull request ready when CI passes, and tells the user', async () => {
    const { publisher, getChecks, notify } = setup();
    await publisher.push(taskId);
    getChecks.mockResolvedValue([check('build', 'pending', true)]);

    await publisher.check();
    expect(latest().ci?.status).toBe('pending');

    getChecks.mockResolvedValue([check('build', 'passed', true), check('lint', 'failed')]);
    await publisher.check();

    expect(getChecks).toHaveBeenCalledWith('octo/app', 7, 'f'.repeat(40));
    expect(latest().ci?.status).toBe('passed');
    expect(notify).toHaveBeenCalledWith('Ready for re-review', 'CI passed on "Add login".');
  });

  it('reports failed CI without sending the agent back', async () => {
    const { publisher, getChecks, notify } = setup();
    await publisher.push(taskId);
    getChecks.mockResolvedValue([check('test', 'failed')]);

    await publisher.check();

    expect(latest()).toMatchObject({ status: 'completed', ci: { status: 'failed' } });
    expect(notify).toHaveBeenCalledWith('CI failed', 'On "Add login": test');
  });
});

describe('checksOutcome', () => {
  it('goes by the required checks when there are some', () => {
    expect(checksOutcome([check('a', 'passed', true), check('b', 'failed')], 0)).toBe('passed');
    expect(checksOutcome([check('a', 'pending', true), check('b', 'passed')], 0)).toBe('pending');
  });

  it('goes by every check when none is required, skipping skipped ones', () => {
    expect(checksOutcome([check('a', 'passed'), check('b', 'failed')], 0)).toBe('failed');
    expect(checksOutcome([check('a', 'passed'), check('b', 'skipped')], 0)).toBe('passed');
  });

  it('waits a little for checks to appear, then has nothing to wait for', () => {
    expect(checksOutcome([], 500, 1000)).toBe('pending');
    expect(checksOutcome([], 1000, 1000)).toBe('passed');
  });
});

describe('commitMessage', () => {
  it('sums up the run and lists what it fixed', () => {
    expect(commitMessage(report([true]))).toBe(
      'Address review feedback\n\nRenamed the store.\n\n- C1: Renamed it.',
    );
  });
});
