import type { DatabaseSync } from 'node:sqlite';
import type { ReviewCompletion } from '../../../shared/contracts/review-completions.ts';
import { transaction } from '../../database/connection.ts';
import { awardReviewCompletion } from '../progression/xp.ts';
import { finishReviewRound } from './rounds.ts';

export function getReviewCompletion(
  db: DatabaseSync,
  pullRequestId: number,
): ReviewCompletion | null {
  const row = db
    .prepare('SELECT completed_at FROM review_completions WHERE pull_request_id = ?')
    .get(pullRequestId) as { completed_at: string } | undefined;
  return row ? { completedAt: row.completed_at } : null;
}

// Records the review as finished, and its latest round with it. Finishing again keeps the
// first completion, so the pull request is counted once however many rounds it takes. The
// first finish also awards the review's XP.
export function finishReview(db: DatabaseSync, pullRequestId: number): ReviewCompletion {
  transaction(db, () => {
    db.prepare('INSERT OR IGNORE INTO review_completions (pull_request_id) VALUES (?)').run(
      pullRequestId,
    );
    finishReviewRound(db, pullRequestId);
    awardReviewCompletion(db, pullRequestId);
  });
  return getReviewCompletion(db, pullRequestId) as ReviewCompletion;
}
