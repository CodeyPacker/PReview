import type { DatabaseSync } from 'node:sqlite';
import type { ReviewCompletion } from '../../../shared/contracts/review-completions.ts';

export function getReviewCompletion(
  db: DatabaseSync,
  pullRequestId: number,
): ReviewCompletion | null {
  const row = db
    .prepare('SELECT completed_at FROM review_completions WHERE pull_request_id = ?')
    .get(pullRequestId) as { completed_at: string } | undefined;
  return row ? { completedAt: row.completed_at } : null;
}

// Records the review as finished. Finishing again keeps the first completion.
export function finishReview(db: DatabaseSync, pullRequestId: number): ReviewCompletion {
  db.prepare('INSERT OR IGNORE INTO review_completions (pull_request_id) VALUES (?)').run(
    pullRequestId,
  );
  return getReviewCompletion(db, pullRequestId) as ReviewCompletion;
}
