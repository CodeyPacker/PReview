import { randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  agentCheckSchema,
  type AgentQuestionItem,
  type AgentReport,
} from '../../../shared/contracts/agent-tasks.ts';
import type {
  AgentActivity,
  AgentProvider,
  AgentRun,
  AgentRunResult,
} from '../../agents/provider.ts';
import type { log as appLog } from '../../logging/log.ts';
import type { GitProvider } from '../../providers/types.ts';
import { cancelQuestions, createQuestion, recordActivity, saveAnswers } from './activity.ts';
import {
  AGENT_INSTRUCTIONS,
  dependencySetup,
  fileDiff,
  loadTaskContext,
  taskPrompt,
} from './context.ts';
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
  // Called when a run completes, so its changes can be pushed.
  onCompleted?: (taskId: number, report: AgentReport) => void;
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
  resume_note: string | null;
  head_sha: string;
  title: string;
}

type Answers = Record<string, string>;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Runs queued agent tasks, oldest first, a few at a time and one per pull request. A failed
// run is retried twice, then waits for the user. Tasks interrupted by a crash resume their
// sessions on the next start. Each step is saved to the task's activity feed, and questions
// the agent asks wait for the user's answer.
export class AgentRunner {
  // Tasks being run. The run is null until the agent has started.
  private readonly running = new Map<number, AgentRun | null>();
  private readonly stopping = new Set<number>();
  // Questions an agent is waiting on, by question id.
  private readonly waiting = new Map<number, (answers: Answers) => void>();
  // Set as the app quits, so ending its agents isn't recorded as the user stopping them.
  private closing = false;

  constructor(private readonly deps: AgentRunnerDeps) {}

  // Puts tasks a crash left mid-run back in the queue. Call once at startup, before wake.
  // Tasks waiting on a question keep waiting. The answer resumes them.
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
             SELECT pull_request_id FROM agent_tasks WHERE status IN ('running', 'waiting')
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
    const stopped = this.deps.db
      .prepare(
        `UPDATE agent_tasks SET status = 'stopped', updated_at = ${NOW}
         WHERE id = ? AND status IN ('queued', 'waiting')`,
      )
      .run(taskId);
    if (stopped.changes > 0) {
      cancelQuestions(this.deps.db, taskId);
      this.activity(taskId, { kind: 'status', summary: 'Stopped' });
    }
  }

  // Sends the agent back to find out why CI failed on its pushed commit. Only on the user's
  // request: PReview never relaunches an agent after CI fails by itself.
  investigate(taskId: number): void {
    const row = this.deps.db
      .prepare(
        `SELECT ci_checks FROM agent_tasks
         WHERE id = ? AND status = 'completed' AND ci_status = 'failed'`,
      )
      .get(taskId) as { ci_checks: string | null } | undefined;
    if (!row) return;
    const failed = agentCheckSchema
      .array()
      .parse(JSON.parse(row.ci_checks ?? '[]'))
      .filter((check) => check.state === 'failed')
      .map((check) => `- ${check.name}${check.url ? ` (${check.url})` : ''}`);
    const note = [
      'CI failed on the changes PReview pushed for you. These checks failed:',
      failed.join('\n'),
      'Find out why and fix it. The network is off, so work from the code and run the checks locally where you can.',
    ].join('\n\n');
    this.deps.db
      .prepare(
        `UPDATE agent_tasks SET status = 'queued', resume_note = ?, attempts = 0,
           updated_at = ${NOW}
         WHERE id = ?`,
      )
      .run(note, taskId);
    this.activity(taskId, { kind: 'status', summary: 'Sent back to investigate the CI failure.' });
    this.wake();
  }

  // Passes the user's answers to the agent that asked. An agent the app restarted on
  // resumes its session with them. Resolves false when the question isn't pending any more.
  answer(questionId: number, answers: Answers): boolean {
    const saved = saveAnswers(this.deps.db, questionId, answers);
    if (!saved) return false;
    this.activity(saved.taskId, {
      kind: 'answer',
      summary: `You answered: ${Object.values(answers).join('; ')}`,
    });
    const deliver = this.waiting.get(questionId);
    if (deliver) {
      this.waiting.delete(questionId);
      deliver(answers);
      return true;
    }
    const note = [
      'The reviewer answered your question.',
      ...saved.questions.map(
        ({ question }) => `Question: ${question}\nAnswer: ${answers[question] ?? '(none)'}`,
      ),
      'Continue the task where you left off.',
    ].join('\n\n');
    this.deps.db
      .prepare(
        `UPDATE agent_tasks SET status = 'queued', resume_note = ?, attempts = 0,
           updated_at = ${NOW}
         WHERE id = ? AND status = 'waiting'`,
      )
      .run(note, saved.taskId);
    this.wake();
    return true;
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
        `SELECT t.id, t.pull_request_id, t.session_id, t.attempts, t.error, t.resume_note,
                COALESCE(t.pushed_sha, s.head_sha) AS head_sha, p.title
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
    if (resume && task.resume_note) {
      prompt = task.resume_note;
    } else if (task.resume_note) {
      // The session couldn't be resumed, so the note goes with the full task.
      prompt += `\n\n${task.resume_note}`;
    } else if (resume) {
      prompt = task.error
        ? `Your last attempt stopped with this error:\n${task.error}\n\nContinue the task where you left off.`
        : 'Continue the task where you left off.';
    } else if (task.attempts > 1) {
      prompt +=
        '\n\nAn earlier attempt may have left changes in this folder. Check them before redoing anything.';
    }
    const setup = resume ? null : dependencySetup(worktree);
    if (setup) prompt += `\n\n${setup}`;
    if (this.stopping.has(task.id)) return { status: 'stopped' };
    this.activity(task.id, {
      kind: 'status',
      summary: resume
        ? 'Resumed its session'
        : task.attempts > 1
          ? `Started attempt ${task.attempts}`
          : 'Started working',
    });

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
      onActivity: (activity) => this.activity(task.id, activity),
      ask: (questions, signal) => this.ask(task.id, context.title, questions, signal),
    });
    // Saved once the session exists, so a restart resumes it rather than starting over.
    this.deps.db
      .prepare(
        `UPDATE agent_tasks SET session_id = ?, updated_at = ${NOW}
         WHERE id = ?`,
      )
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

  // Records the question, tells the user and waits for the answer. A stop withdraws it.
  private ask(
    taskId: number,
    title: string,
    questions: AgentQuestionItem[],
    signal: AbortSignal,
  ): Promise<Answers | null> {
    const { db } = this.deps;
    const questionId = createQuestion(db, taskId, questions);
    db.prepare(`UPDATE agent_tasks SET status = 'waiting', updated_at = ${NOW} WHERE id = ?`).run(
      taskId,
    );
    this.activity(taskId, {
      kind: 'question',
      summary: questions.map(({ question }) => question).join('\n'),
    });
    this.deps.notify('An agent has a question', `On "${title}": ${questions[0]?.question ?? ''}`);
    return new Promise((resolve) => {
      this.waiting.set(questionId, (answers) => {
        db.prepare(
          `UPDATE agent_tasks SET status = 'running', updated_at = ${NOW} WHERE id = ?`,
        ).run(taskId);
        resolve(answers);
      });
      signal.addEventListener(
        'abort',
        () => {
          if (!this.waiting.delete(questionId)) return;
          // Quitting keeps the question, so it can still be answered after the restart.
          if (!this.closing) cancelQuestions(db, taskId);
          resolve(null);
        },
        { once: true },
      );
    });
  }

  private activity(taskId: number, activity: AgentActivity): void {
    if (!this.closing) recordActivity(this.deps.db, taskId, activity);
  }

  private record(task: TaskRow, result: AgentRunResult, resumed: boolean): void {
    const { db } = this.deps;
    if (result.status === 'completed') {
      db.prepare(
        `UPDATE agent_tasks
         SET status = 'completed', result = ?, cost_usd = ?, error = NULL, resume_note = NULL,
             push_status = NULL, push_error = NULL, finished_at = ${NOW}, updated_at = ${NOW}
         WHERE id = ?`,
      ).run(JSON.stringify(result.report), result.costUsd, task.id);
      this.activity(task.id, { kind: 'status', summary: `Finished. ${result.report.summary}` });
      this.deps.onCompleted?.(task.id, result.report);
      return;
    }
    if (result.status === 'stopped' || this.stopping.has(task.id)) {
      db.prepare(
        `UPDATE agent_tasks SET status = 'stopped', finished_at = ${NOW}, updated_at = ${NOW}
         WHERE id = ?`,
      ).run(task.id);
      this.activity(task.id, { kind: 'status', summary: 'Stopped' });
      return;
    }
    this.deps.log.warn('Agent task failed', task.id, result.error);
    // attempts already counts this run.
    const retry = result.retryable && task.attempts < MAX_ATTEMPTS;
    db.prepare(
      `UPDATE agent_tasks
       SET status = ?, error = ?, finished_at = ${retry ? 'finished_at' : NOW},
           updated_at = ${NOW}
           ${resumed ? ', session_id = NULL' : ''}
       WHERE id = ?`,
    ).run(retry ? 'queued' : 'failed', result.error, task.id);
    this.activity(task.id, {
      kind: 'error',
      summary: retry ? 'The run failed. Trying again.' : 'The run failed.',
      detail: result.error,
    });
    if (!retry) this.deps.notify('An agent run failed', `On "${task.title}": ${result.error}`);
  }
}
