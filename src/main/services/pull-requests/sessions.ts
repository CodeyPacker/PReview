import type { DatabaseSync } from 'node:sqlite';
import type {
  ReviewSession,
  SaveReviewSessionInput,
} from '../../../shared/contracts/review-sessions.ts';
import { transaction } from '../../database/connection.ts';

interface ReviewSessionRow {
  pull_request_id: number;
  selected_path: string | null;
  scroll_top: number;
  diff_mode: ReviewSession['diffMode'];
}

// The pull request's session, or null before it was first opened.
export function getReviewSession(db: DatabaseSync, pullRequestId: number): ReviewSession | null {
  const row = db
    .prepare(
      `SELECT pull_request_id, selected_path, scroll_top, diff_mode
       FROM review_sessions
       WHERE pull_request_id = ?`,
    )
    .get(pullRequestId) as ReviewSessionRow | undefined;
  return row
    ? {
        pullRequestId: row.pull_request_id,
        selectedPath: row.selected_path,
        scrollTop: row.scroll_top,
        diffMode: row.diff_mode,
      }
    : null;
}

export function saveReviewSession(
  db: DatabaseSync,
  { pullRequestId, selectedPath, scrollTop, diffMode }: SaveReviewSessionInput,
): ReviewSession {
  db.prepare(
    `INSERT INTO review_sessions (pull_request_id, selected_path, scroll_top, diff_mode)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (pull_request_id) DO UPDATE SET
       selected_path = excluded.selected_path,
       scroll_top = excluded.scroll_top,
       diff_mode = excluded.diff_mode,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(pullRequestId, selectedPath, scrollTop, diffMode);
  return { pullRequestId, selectedPath, scrollTop, diffMode };
}

// The pull request whose review was open when the app last closed, if it is still stored.
export function getActiveReview(db: DatabaseSync): number | null {
  const row = db.prepare('SELECT pull_request_id FROM review_sessions WHERE active = 1').get() as
    { pull_request_id: number } | undefined;
  return row?.pull_request_id ?? null;
}

// Marks the review on show, or none when null.
export function setActiveReview(db: DatabaseSync, pullRequestId: number | null): void {
  transaction(db, () => {
    db.prepare('UPDATE review_sessions SET active = 0 WHERE active = 1').run();
    if (pullRequestId === null) return;
    db.prepare(
      `INSERT INTO review_sessions (pull_request_id, active) VALUES (?, 1)
       ON CONFLICT (pull_request_id) DO UPDATE SET active = 1`,
    ).run(pullRequestId);
  });
}
