import { randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { AgentProvider, AgentRun, AgentRunResult } from '../../agents/provider.ts';
import type { log as appLog } from '../../logging/log.ts';
import type { GitProvider } from '../../providers/types.ts';
import { AGENT_INSTRUCTIONS, fileDiff, loadTaskContext, taskPrompt } from './context.ts';
import type { AgentWorktrees } from './worktrees.ts';

export interface AgentRunnerDeps {
  db: DatabaseSync;
  provider: GitProvider;
  agent: AgentProvider;
  worktrees: Pick<AgentWorktrees, 'open' | 'release' | 'releaseAll'>;
  // Shows a system notification.
  notify: (title: string, body: string) => void;
  log: Pick<typeof appLog, 'warn'>;
  // Tasks that may run at once.
  limit?: number;
  // How long a run goes before the user is told.
  longRunMs?: number;
}

// The first run plus two automatic retries.
const MAX_ATTEMPTS = 3;
const DEFAULT_LIMIT = 2;
const LONG_RUN_MS = 25 * 60_000;
// Repository instructions longer than this are cut, to keep the prompt small.
const MAX_INSTRUCTIONS = 20_000;
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

interface TaskRow {
  id: number;
  pull_request_id: number;
  session_id: string | null;
  attempts: number;
  error: string | null;
  head_sha: string;
  title: string;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Runs queued agent tasks, oldest first, a few at a time and one per pull request. A failed
// run is retried twice, then waits for the user. Tasks interrupted by a crash resume their
// sessions on the next start.
export class AgentRunner {
  // Tasks being run. The run is null until the agent has started.
  private readonly running = new Map<number, AgentRun | null>();
  private readonly stopping = new Set<number>();
  // Set as the app quits, so ending its agents isn't recorded as the user stopping them.
  private closing = false;

  constructor(private readonly deps: AgentRunnerDeps) {}

  // Puts tasks a crash left mid-run back in the queue. Call once at startup, before wake.
  recover(): void {
    this.deps.db
      .prepare(
        `UPDATE agent_tasks SET status = 'queued', updated_at = ${NOW} WHERE status = 'running'`,
      )
      .run();
    this.deps.worktrees.releaseAll();
  }

  // Starts queued tasks while there is room.
  wake(): void {
    const limit = this.deps.limit ?? DEFAULT_LIMIT;
    while (this.running.size < limit) {
      const next = this.deps.db
        .prepare(
          `SELECT id FROM agent_tasks
           WHERE status = 'queued' AND pull_request_id NOT IN (
             SELECT pull_request_id FROM agent_tasks WHERE status = 'running'
           )
           ORDER BY id LIMIT 1`,
        )
        .get() as { id: number } | undefined;
      if (!next) return;
      this.deps.db
        .prepare(
          `UPDATE agent_tasks
           SET status = 'running', attempts = attempts + 1, started_at = ${NOW},
               updated_at = ${NOW}
           WHERE id = ?`,
        )
        .run(next.id);
      this.running.set(next.id, null);
      void this.run(next.id).finally(() => {
        this.running.delete(next.id);
        this.stopping.delete(next.id);
        if (!this.closing) this.wake();
      });
    }
  }

  // Stops a task. A running one finishes its current step first.
  async stop(taskId: number): Promise<void> {
    if (this.running.has(taskId)) {
      this.stopping.add(taskId);
      await this.running.get(taskId)?.stop();
      return;
    }
    this.deps.db
      .prepare(
        `UPDATE agent_tasks SET status = 'stopped', updated_at = ${NOW}
         WHERE id = ? AND status = 'queued'`,
      )
      .run(taskId);
  }

  // Ends a running task's agent at once.
  forceStop(taskId: number): void {
    if (!this.running.has(taskId)) return;
    this.stopping.add(taskId);
    this.running.get(taskId)?.forceStop();
  }

  // Ends every agent as the app quits. Their tasks stay running in the database, so the next
  // start resumes them.
  shutdown(): void {
    this.closing = true;
    for (const run of this.running.values()) run?.forceStop();
  }

  // Queues a stopped or failed task again, with fresh retries.
  resume(taskId: number): void {
    this.deps.db
      .prepare(
        `UPDATE agent_tasks SET status = 'queued', attempts = 0, updated_at = ${NOW}
         WHERE id = ? AND status IN ('stopped', 'failed')`,
      )
      .run(taskId);
    this.wake();
  }

  private async run(taskId: number): Promise<void> {
    const task = this.deps.db
      .prepare(
        `SELECT t.id, t.pull_request_id, t.session_id, t.attempts, t.error, s.head_sha, p.title
         FROM agent_tasks t
         JOIN review_submissions s ON s.id = t.submission_id
         JOIN pull_requests p ON p.id = t.pull_request_id
         WHERE t.id = ?`,
      )
      .get(taskId) as TaskRow | undefined;
    if (!task) return;
    let result: AgentRunResult;
    let resumed = false;
    try {
      const opened = await this.deps.worktrees.open(task.pull_request_id, task.head_sha, taskId);
      if (opened.status === 'blocked') {
        result = { status: 'failed', error: opened.reason, retryable: false };
      } else {
        try {
          resumed = task.session_id !== null;
          result = await this.runAgent(task, await realpath(opened.path));
        } finally {
          this.deps.worktrees.release(taskId);
        }
      }
    } catch (error) {
      result = { status: 'failed', error: messageOf(error), retryable: true };
    }
    if (!this.closing) this.record(task, result, resumed);
  }

  private async runAgent(task: TaskRow, worktree: string): Promise<AgentRunResult> {
    const context = await loadTaskContext(this.deps.db, this.deps.provider, task.id);
    const repositoryInstructions = (
      await readFile(join(worktree, 'CLAUDE.md'), 'utf8').catch(() => '')
    ).slice(0, MAX_INSTRUCTIONS);
    const resume = task.session_id !== null;
    let prompt = taskPrompt(context);
    if (resume) {
      prompt = task.error
        ? `Your last attempt stopped with this error:\n${task.error}\n\nContinue the task where you left off.`
        : 'Continue the task where you left off.';
    } else if (task.attempts > 1) {
      prompt +=
        '\n\nAn earlier attempt may have left changes in this folder. Check them before redoing anything.';
    }
    if (this.stopping.has(task.id)) return { status: 'stopped' };

    const sessionId = task.session_id ?? randomUUID();
    const run = await this.deps.agent.start({
      worktree,
      prompt,
      instructions: repositoryInstructions
        ? `${AGENT_INSTRUCTIONS}\n\nThe repository's own instructions (CLAUDE.md):\n\n${repositoryInstructions}`
        : AGENT_INSTRUCTIONS,
      sessionId,
      resume,
      getFileDiff: (path) => fileDiff(context.files, path),
    });
    // Saved once the session exists, so a restart resumes it rather than starting over.
    this.deps.db
      .prepare(`UPDATE agent_tasks SET session_id = ?, updated_at = ${NOW} WHERE id = ?`)
      .run(sessionId, task.id);
    this.running.set(task.id, run);
    if (this.stopping.has(task.id)) void run.stop();

    const timer = setTimeout(
      () =>
        this.deps.notify(
          'An agent is still working',
          `It has worked on "${context.title}" for ${Math.round((this.deps.longRunMs ?? LONG_RUN_MS) / 60_000)} minutes. Open PReview to check on it or stop it.`,
        ),
      this.deps.longRunMs ?? LONG_RUN_MS,
    );
    try {
      return await run.result;
    } finally {
      clearTimeout(timer);
    }
  }

  private record(task: TaskRow, result: AgentRunResult, resumed: boolean): void {
    const { db } = this.deps;
    if (result.status === 'completed') {
      db.prepare(
        `UPDATE agent_tasks
         SET status = 'completed', result = ?, cost_usd = ?, error = NULL,
             finished_at = ${NOW}, updated_at = ${NOW}
         WHERE id = ?`,
      ).run(JSON.stringify(result.report), result.costUsd, task.id);
      return;
    }
    if (result.status === 'stopped' || this.stopping.has(task.id)) {
      db.prepare(
        `UPDATE agent_tasks SET status = 'stopped', finished_at = ${NOW}, updated_at = ${NOW}
         WHERE id = ?`,
      ).run(task.id);
      return;
    }
    if (result.status === 'failed') this.deps.log.warn('Agent task failed', task.id, result.error);
    // attempts already counts this run.
    const retry = result.retryable && task.attempts < MAX_ATTEMPTS;
    db.prepare(
      `UPDATE agent_tasks
       SET status = ?, error = ?, finished_at = ${retry ? 'finished_at' : NOW},
           updated_at = ${NOW}
           ${resumed ? ', session_id = NULL' : ''}
       WHERE id = ?`,
    ).run(retry ? 'queued' : 'failed', result.error, task.id);
  }
}
