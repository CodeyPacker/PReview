import type { DatabaseSync } from 'node:sqlite';
import {
  agentReportSchema,
  type AgentChange,
  type AgentCheck,
  type AgentReport,
} from '../../../shared/contracts/agent-tasks.ts';
import type { log as appLog } from '../../logging/log.ts';
import type { GitProvider } from '../../providers/types.ts';
import { recordActivity } from './activity.ts';
import type { AgentWorktrees } from './worktrees.ts';

export interface AgentPublisherDeps {
  db: DatabaseSync;
  provider: GitProvider;
  worktrees: Pick<AgentWorktrees, 'publish' | 'changes'>;
  notify: (title: string, body: string) => void;
  log: Pick<typeof appLog, 'warn'>;
  // How often pushed commits' checks are read.
  pollMs?: number;
  // A commit with no checks after this long has nothing to wait for.
  noChecksMs?: number;
  now?: () => number;
}

const POLL_MS = 30_000;
const NO_CHECKS_MS = 2 * 60_000;
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Whether the checks that matter passed: the required ones, or every one when none is
// required. Skipped checks don't count against it.
export function checksOutcome(
  checks: AgentCheck[],
  waitedMs: number,
  noChecksMs = NO_CHECKS_MS,
): 'pending' | 'passed' | 'failed' {
  const required = checks.filter((check) => check.required);
  const relevant = required.length > 0 ? required : checks;
  if (relevant.some((check) => check.state === 'failed')) return 'failed';
  if (relevant.some((check) => check.state === 'pending')) return 'pending';
  // Checks can take a moment to appear after a push.
  if (relevant.length === 0) return waitedMs >= noChecksMs ? 'passed' : 'pending';
  return 'passed';
}

// The commit message for a run's changes: its summary and the items it fixed.
export function commitMessage(report: AgentReport): string {
  const fixed = report.items
    .filter((item) => item.outcome === 'fixed')
    .map((item) => `- ${item.id}: ${item.note}`);
  return [
    'Address review feedback',
    report.summary,
    ...(fixed.length > 0 ? [fixed.join('\n')] : []),
  ]
    .filter(Boolean)
    .join('\n\n');
}

interface TaskRow {
  id: number;
  pull_request_id: number;
  result: string | null;
  pushed_sha: string | null;
  pushed_at: string | null;
  number: number;
  title: string;
  github_owner: string | null;
  github_name: string | null;
}

// Commits and pushes what agents changed, then follows CI on the pushed commit. A pull request
// becomes ready for re-review once its checks pass. When they fail, the user decides whether
// to send the agent back. PReview never does that by itself.
export class AgentPublisher {
  private readonly pushing = new Set<number>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: AgentPublisherDeps) {}

  // Pushes a completed run's changes, so the reviewer can see them on the pull request. A
  // failed test doesn't hold them back, since an agent's sandbox can fail tests that CI passes.
  // CI still checks the pushed commit, and a failed test shows in the task's activity.
  async afterRun(taskId: number, report: AgentReport): Promise<void> {
    if (report.tests.some((test) => !test.passed)) {
      recordActivity(this.deps.db, taskId, {
        kind: 'status',
        summary: 'A test failed in the agent’s sandbox. Pushing anyway, so CI can check it.',
      });
    }
    await this.push(taskId);
  }

  // The task's changes that aren't pushed yet.
  async changes(taskId: number): Promise<AgentChange[]> {
    const task = this.find(taskId);
    return task ? this.deps.worktrees.changes(task.pull_request_id) : [];
  }

  // Commits the task's changes and pushes them to the pull request's branch.
  async push(taskId: number): Promise<void> {
    if (this.pushing.has(taskId)) return;
    const task = this.find(taskId);
    if (!task?.result) return;
    this.pushing.add(taskId);
    try {
      const report = agentReportSchema.parse(JSON.parse(task.result));
      const result = await this.deps.worktrees
        .publish(task.pull_request_id, taskId, commitMessage(report))
        .catch((error: unknown) => ({ status: 'blocked' as const, reason: messageOf(error) }));
      const { db } = this.deps;
      if (result.status === 'pushed') {
        db.prepare(
          `UPDATE agent_tasks
           SET push_status = 'pushed', push_error = NULL, pushed_sha = ?, pushed_at = ${NOW},
               ci_status = 'pending', ci_checks = NULL, updated_at = ${NOW}
           WHERE id = ?`,
        ).run(result.sha, taskId);
        recordActivity(db, taskId, {
          kind: 'status',
          summary: `Pushed the changes as ${result.sha.slice(0, 7)}. Waiting for CI.`,
        });
        void this.check();
      } else if (result.status === 'no_changes') {
        db.prepare(
          `UPDATE agent_tasks SET push_status = 'no_changes', push_error = NULL,
             updated_at = ${NOW}
           WHERE id = ?`,
        ).run(taskId);
        recordActivity(db, taskId, { kind: 'status', summary: 'There were no changes to push.' });
      } else {
        db.prepare(
          `UPDATE agent_tasks SET push_status = 'blocked', push_error = ?, updated_at = ${NOW}
           WHERE id = ?`,
        ).run(result.reason, taskId);
        recordActivity(db, taskId, {
          kind: 'error',
          summary: "The changes weren't pushed.",
          detail: result.reason,
        });
      }
    } finally {
      this.pushing.delete(taskId);
    }
  }

  // Reads checks now and then every pollMs.
  start(): void {
    void this.check();
    this.timer = setInterval(() => void this.check(), this.deps.pollMs ?? POLL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  // Reads the checks of every pushed commit still waiting on CI.
  async check(): Promise<void> {
    const pending = this.deps.db
      .prepare(`SELECT id FROM agent_tasks WHERE ci_status = 'pending' AND pushed_sha IS NOT NULL`)
      .all() as { id: number }[];
    for (const { id } of pending) {
      const task = this.find(id);
      if (!task?.pushed_sha || !task.github_owner || !task.github_name) continue;
      try {
        const checks = await this.deps.provider.getChecks(
          `${task.github_owner}/${task.github_name}`,
          task.number,
          task.pushed_sha,
        );
        const waited = (this.deps.now ?? Date.now)() - Date.parse(task.pushed_at ?? '');
        this.record(task, checks, checksOutcome(checks, waited, this.deps.noChecksMs));
      } catch (error) {
        this.deps.log.warn('Could not read CI checks', id, error);
      }
    }
  }

  private record(task: TaskRow, checks: AgentCheck[], outcome: ReturnType<typeof checksOutcome>) {
    const { db } = this.deps;
    db.prepare(
      `UPDATE agent_tasks SET ci_status = ?, ci_checks = ?, updated_at = ${NOW} WHERE id = ?`,
    ).run(outcome, JSON.stringify(checks), task.id);
    if (outcome === 'passed') {
      recordActivity(db, task.id, { kind: 'status', summary: 'CI passed. Ready for re-review.' });
      this.deps.notify('Ready for re-review', `CI passed on "${task.title}".`);
    } else if (outcome === 'failed') {
      const failed = checks.filter((check) => check.state === 'failed').map((check) => check.name);
      recordActivity(db, task.id, {
        kind: 'error',
        summary: `CI failed: ${failed.join(', ')}`,
      });
      this.deps.notify('CI failed', `On "${task.title}": ${failed.join(', ')}`);
    }
  }

  private find(taskId: number): TaskRow | undefined {
    return this.deps.db
      .prepare(
        `SELECT t.id, t.pull_request_id, t.result, t.pushed_sha, t.pushed_at, p.number, p.title,
                r.github_owner, r.github_name
         FROM agent_tasks t
         JOIN pull_requests p ON p.id = t.pull_request_id
         JOIN repositories r ON r.id = p.repository_id
         WHERE t.id = ?`,
      )
      .get(taskId) as TaskRow | undefined;
  }
}
