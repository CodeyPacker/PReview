import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { finishReview } from './completions.ts';
import { endReviewRound, syncReviewRounds } from './rounds.ts';
import { setActiveReview } from './sessions.ts';
import { listPullRequests, reviewStateOf } from './store.ts';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('reviewStateOf', () => {
  const base = {
    opened: false,
    hasDrafts: false,
    headSha: A,
    submittedHeadSha: null,
    finishedAt: null,
  };

  it('starts at needs review and moves to in progress once opened', () => {
    expect(reviewStateOf(base)).toBe('needs-review');
    expect(reviewStateOf({ ...base, opened: true })).toBe('in-progress');
  });

  it('shows draft feedback while unsent drafts exist', () => {
    expect(reviewStateOf({ ...base, opened: true, hasDrafts: true })).toBe('draft-feedback');
  });

  it('shows feedback submitted until the head changes, then ready for re-review', () => {
    const submitted = { ...base, opened: true, submittedHeadSha: A };
    expect(reviewStateOf(submitted)).toBe('feedback-submitted');
    expect(reviewStateOf({ ...submitted, headSha: B })).toBe('ready-for-rereview');
    // New commits an agent pushed wait for their CI.
    expect(reviewStateOf({ ...submitted, headSha: B, agentCi: 'pending' })).toBe(
      'feedback-submitted',
    );
    expect(reviewStateOf({ ...submitted, headSha: B, agentCi: 'failed' })).toBe('action-required');
    expect(reviewStateOf({ ...submitted, headSha: B, agentCi: 'passed' })).toBe(
      'ready-for-rereview',
    );
  });

  it('shows completed once the round is finished', () => {
    expect(
      reviewStateOf({ ...base, opened: true, submittedHeadSha: A, finishedAt: '2026-11-02' }),
    ).toBe('completed');
  });
});

describe('listPullRequests review state', () => {
  let db: DatabaseSync;
  let pullRequestId: number;

  function state(): string | undefined {
    return listPullRequests(db).find((pull) => pull.id === pullRequestId)?.reviewState;
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
    db.prepare(
      `INSERT INTO pull_requests
         (repository_id, provider_id, number, title, draft, url, head_branch, head_sha,
          base_branch, created_at, updated_at)
       VALUES (?, '10', 7, 'Title', 0, 'https://example.test', 'feature', ?, 'main', 'a', 'b')`,
    ).run(repository.id, A);
    pullRequestId = (db.prepare('SELECT id FROM pull_requests').get() as { id: number }).id;
  });

  it('follows a review from the first look to the re-review', () => {
    expect(state()).toBe('needs-review');

    setActiveReview(db, pullRequestId);
    syncReviewRounds(db, pullRequestId, A);
    expect(state()).toBe('in-progress');

    db.exec(`INSERT INTO review_drafts (pull_request_id, head_sha, merge_base, path, side, line, body)
      VALUES (${pullRequestId}, '${A}', '${A}', 'a.ts', 'modified', 1, 'x')`);
    expect(state()).toBe('draft-feedback');

    db.exec('DELETE FROM review_drafts');
    endReviewRound(db, pullRequestId, A);
    expect(state()).toBe('feedback-submitted');

    finishReview(db, pullRequestId);
    expect(state()).toBe('completed');

    db.prepare('UPDATE pull_requests SET head_sha = ? WHERE id = ?').run(B, pullRequestId);
    expect(state()).toBe('ready-for-rereview');

    setActiveReview(db, pullRequestId);
    syncReviewRounds(db, pullRequestId, B);
    expect(state()).toBe('in-progress');
  });
});
