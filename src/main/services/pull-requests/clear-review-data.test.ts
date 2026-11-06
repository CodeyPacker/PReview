import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { clearReviewData } from './clear-review-data.ts';
import { createReviewFinding } from './findings.ts';

let db: ReturnType<typeof openDatabase>;
let pullRequestId: number;

const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total;

function addSubmission(state: 'publishing' | 'published', taskStatus: string) {
  db.prepare(
    `INSERT INTO review_submissions
       (id, pull_request_id, head_sha, verdict, body, comments, draft_ids, finding_ids,
        send_to_agent, state)
     VALUES ('submission', ?, 'headsha', 'comment', '', '[]', '[]', '[]', 1, ?)`,
  ).run(pullRequestId, state);
  db.prepare(
    `INSERT INTO agent_tasks (submission_id, pull_request_id, status)
     VALUES ('submission', ?, ?)`,
  ).run(pullRequestId, taskStatus);
}

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  reconcileRepositories(db, [
    {
      path: '/code/app',
      name: 'app',
      remoteUrl: 'git@github.com:octo/app.git',
      rootCommit: 'root',
    },
  ]);
  const repository = db.prepare('SELECT id FROM repositories').get() as { id: number };
  pullRequestId = Number(
    db
      .prepare(
        `INSERT INTO pull_requests
           (repository_id, provider_id, number, title, draft, url, head_branch, head_sha,
            base_branch, created_at, updated_at)
         VALUES (?, '10', 7, 'Title', 0, 'https://example.test', 'feature', 'headsha', 'main',
                 'a', 'b')`,
      )
      .run(repository.id).lastInsertRowid,
  );
  createReviewFinding(db, {
    pullRequestId,
    category: 'bug',
    description: 'Crashes on save.',
    steps: '',
    newScreenshots: [],
  });
  db.prepare(
    `INSERT INTO xp_transactions
       (reward_key, reason, base_xp, multiplier, amount, active_ms, pull_request_id, repository,
        number, character_id)
     VALUES ('key', 'review-completed', 10, 1, 10, 0, ?, 'octo/app', 7, 'shadow')`,
  ).run(pullRequestId);
});

describe('clearReviewData', () => {
  it('deletes findings, submissions and agent history, and keeps pull requests and XP', () => {
    addSubmission('published', 'completed');

    expect(clearReviewData(db)).toEqual({ status: 'cleared' });

    expect(count('review_findings')).toBe(0);
    expect(count('review_submissions')).toBe(0);
    expect(count('agent_tasks')).toBe(0);
    expect(count('pull_requests')).toBe(1);
    expect(count('xp_transactions')).toBe(1);
  });

  it.each(['queued', 'running', 'waiting'])('deletes nothing while a task is %s', (status) => {
    addSubmission('published', status);

    expect(clearReviewData(db)).toEqual({ status: 'busy' });

    expect(count('review_findings')).toBe(1);
    expect(count('agent_tasks')).toBe(1);
  });

  it('deletes nothing while a review is being sent', () => {
    addSubmission('publishing', 'completed');

    expect(clearReviewData(db)).toEqual({ status: 'busy' });

    expect(count('review_submissions')).toBe(1);
  });
});
