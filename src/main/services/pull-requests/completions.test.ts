import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { finishReview, getReviewCompletion } from './completions.ts';

let db: ReturnType<typeof openDatabase>;
let pullRequestId: number;

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
  db.prepare(
    `INSERT INTO pull_requests
       (repository_id, provider_id, number, title, draft, url, head_branch, head_sha, base_branch,
        created_at, updated_at)
     VALUES (?, '10', 7, 'Title', 0, 'https://example.test', 'feature', 'headsha', 'main', 'a', 'b')`,
  ).run(repository.id);
  pullRequestId = (db.prepare('SELECT id FROM pull_requests').get() as { id: number }).id;
});

describe('review completions', () => {
  it('is unfinished until the review is finished', () => {
    expect(getReviewCompletion(db, pullRequestId)).toBeNull();
    const completion = finishReview(db, pullRequestId);
    expect(getReviewCompletion(db, pullRequestId)).toEqual(completion);
  });

  it('keeps the first completion when finished again', () => {
    db.prepare(
      "INSERT INTO review_completions (pull_request_id, completed_at) VALUES (?, '2026-01-01T00:00:00.000Z')",
    ).run(pullRequestId);
    expect(finishReview(db, pullRequestId)).toEqual({ completedAt: '2026-01-01T00:00:00.000Z' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM review_completions').get()).toEqual({ n: 1 });
  });

  it('goes with its pull request', () => {
    finishReview(db, pullRequestId);
    db.prepare('DELETE FROM pull_requests WHERE id = ?').run(pullRequestId);
    expect(db.prepare('SELECT COUNT(*) AS n FROM review_completions').get()).toEqual({ n: 0 });
  });
});
