import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { finishReview } from './completions.ts';
import { endReviewRound, syncReviewRounds } from './rounds.ts';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

let db: DatabaseSync;
let pullRequestId: number;

function draftCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM review_drafts').get() as { n: number }).n;
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
       (repository_id, provider_id, number, title, draft, url, head_branch, head_sha, base_branch,
        created_at, updated_at)
     VALUES (?, '10', 7, 'Title', 0, 'https://example.test', 'feature', ?, 'main', 'a', 'b')`,
  ).run(repository.id, A);
  pullRequestId = (db.prepare('SELECT id FROM pull_requests').get() as { id: number }).id;
});

describe('review rounds', () => {
  it('opens round 1 on the head on show', () => {
    expect(syncReviewRounds(db, pullRequestId, A)).toMatchObject([
      { number: 1, headSha: A, baselineSha: null, submittedAt: null, finishedAt: null },
    ]);
    expect(syncReviewRounds(db, pullRequestId, A)).toHaveLength(1);
  });

  it('stays in the round when new commits arrive before it is submitted', () => {
    syncReviewRounds(db, pullRequestId, A);
    expect(syncReviewRounds(db, pullRequestId, B)).toHaveLength(1);
  });

  it('starts round 2 on new commits after a submit and baselines it at the submitted head', () => {
    syncReviewRounds(db, pullRequestId, A);
    endReviewRound(db, pullRequestId, A);
    expect(syncReviewRounds(db, pullRequestId, A)).toHaveLength(1);

    const rounds = syncReviewRounds(db, pullRequestId, B);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.submittedAt).not.toBeNull();
    expect(rounds[1]).toMatchObject({ number: 2, headSha: B, baselineSha: A });
  });

  it('drops the drafts left over when the next round starts, and not before', () => {
    syncReviewRounds(db, pullRequestId, A);
    db.exec(`INSERT INTO review_drafts (pull_request_id, head_sha, merge_base, path, side, line, body)
      VALUES (${pullRequestId}, '${A}', '${A}', 'a.ts', 'modified', 1, 'x')`);
    endReviewRound(db, pullRequestId, A);
    syncReviewRounds(db, pullRequestId, A);
    expect(draftCount()).toBe(1);

    syncReviewRounds(db, pullRequestId, B);
    expect(draftCount()).toBe(0);
  });

  it('ends a later round at the head it was submitted at', () => {
    syncReviewRounds(db, pullRequestId, A);
    endReviewRound(db, pullRequestId, A);
    syncReviewRounds(db, pullRequestId, B);
    endReviewRound(db, pullRequestId, C);

    expect(syncReviewRounds(db, pullRequestId, C)).toHaveLength(2);
    expect(syncReviewRounds(db, pullRequestId, 'd'.repeat(40))[2]).toMatchObject({
      number: 3,
      baselineSha: C,
    });
  });

  it('finishes only the latest round', () => {
    syncReviewRounds(db, pullRequestId, A);
    finishReview(db, pullRequestId);
    endReviewRound(db, pullRequestId, A);
    syncReviewRounds(db, pullRequestId, B);

    const [first, second] = syncReviewRounds(db, pullRequestId, B);
    expect(first?.finishedAt).not.toBeNull();
    expect(second?.finishedAt).toBeNull();
  });

  it('goes with its pull request', () => {
    syncReviewRounds(db, pullRequestId, A);
    db.exec('DELETE FROM pull_requests');
    expect(db.prepare('SELECT COUNT(*) AS n FROM review_rounds').get()).toEqual({ n: 0 });
  });
});
