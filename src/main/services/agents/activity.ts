import type { DatabaseSync } from 'node:sqlite';
import {
  agentQuestionItemSchema,
  agentReportSchema,
  type AgentEvent,
  type AgentQuestionItem,
  type AgentTask,
} from '../../../shared/contracts/agent-tasks.ts';
import type { AgentActivity } from '../../agents/provider.ts';
import { redact } from '../../logging/redact.ts';

// Summaries stay short in the feed. Logs behind them are cut to keep the database small.
const MAX_SUMMARY = 500;
const MAX_DETAIL = 8_000;
// The feed shows a task's most recent events.
const FEED_LENGTH = 200;
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

// Saves a feed entry, with credentials stripped.
export function recordActivity(db: DatabaseSync, taskId: number, activity: AgentActivity): void {
  db.prepare('INSERT INTO agent_events (task_id, kind, summary, detail) VALUES (?, ?, ?, ?)').run(
    taskId,
    activity.kind,
    clip(redact(activity.summary) as string, MAX_SUMMARY),
    activity.detail ? clip(redact(activity.detail) as string, MAX_DETAIL) : null,
  );
}

// The task's latest events, oldest first.
export function listActivity(db: DatabaseSync, taskId: number): AgentEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT id, kind, summary, detail, created_at FROM agent_events
         WHERE task_id = ? ORDER BY id DESC LIMIT ?
       ) ORDER BY id`,
    )
    .all(taskId, FEED_LENGTH) as {
    id: number;
    kind: AgentEvent['kind'];
    summary: string;
    detail: string | null;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    summary: row.summary,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

// Every task, newest first, with its unanswered question.
export function listAgentTasks(db: DatabaseSync): AgentTask[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.pull_request_id, t.status, t.attempts, t.error, t.result, t.cost_usd,
              t.created_at, t.started_at, t.finished_at,
              q.id AS question_id, q.questions, q.created_at AS question_created_at
       FROM agent_tasks t
       LEFT JOIN agent_questions q ON q.task_id = t.id AND q.status = 'pending'
       ORDER BY t.id DESC`,
    )
    .all() as {
    id: number;
    pull_request_id: number;
    status: AgentTask['status'];
    attempts: number;
    error: string | null;
    result: string | null;
    cost_usd: number | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    question_id: number | null;
    questions: string | null;
    question_created_at: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    pullRequestId: row.pull_request_id,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    report: row.result ? agentReportSchema.parse(JSON.parse(row.result)) : null,
    costUsd: row.cost_usd,
    question:
      row.question_id !== null && row.questions && row.question_created_at
        ? {
            id: row.question_id,
            questions: agentQuestionItemSchema.array().parse(JSON.parse(row.questions)),
            createdAt: row.question_created_at,
          }
        : null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

export function createQuestion(
  db: DatabaseSync,
  taskId: number,
  questions: AgentQuestionItem[],
): number {
  return Number(
    db
      .prepare('INSERT INTO agent_questions (task_id, questions) VALUES (?, ?)')
      .run(taskId, JSON.stringify(questions)).lastInsertRowid,
  );
}

// Saves the answers to a pending question. Resolves with its task, or null when the question
// isn't pending any more.
export function saveAnswers(
  db: DatabaseSync,
  questionId: number,
  answers: Record<string, string>,
): { taskId: number; questions: AgentQuestionItem[] } | null {
  const row = db
    .prepare(`SELECT task_id, questions FROM agent_questions WHERE id = ? AND status = 'pending'`)
    .get(questionId) as { task_id: number; questions: string } | undefined;
  if (!row) return null;
  db.prepare(
    `UPDATE agent_questions SET status = 'answered', answers = ?, answered_at = ${NOW}
     WHERE id = ?`,
  ).run(JSON.stringify(answers), questionId);
  return {
    taskId: row.task_id,
    questions: agentQuestionItemSchema.array().parse(JSON.parse(row.questions)),
  };
}

// Withdraws a task's pending questions, such as when it stops.
export function cancelQuestions(db: DatabaseSync, taskId: number): void {
  db.prepare(
    `UPDATE agent_questions SET status = 'cancelled' WHERE task_id = ? AND status = 'pending'`,
  ).run(taskId);
}
