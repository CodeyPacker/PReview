import type { DatabaseSync } from 'node:sqlite';
import type { ReviewRound } from '../../../shared/contracts/review-rounds.ts';
import { transaction } from '../../database/connection.ts';

interface ReviewRoundRow {
  number: number;
  head_sha: string;
  baseline_sha: string | null;
  started_at: string;
  submitted_head_sha: string | null;
  submitted_at: string | null;
  finished_at: string | null;
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

function selectRounds(db: DatabaseSync, pullRequestId: number): ReviewRoundRow[] {
  return db
    .prepare(
      `SELECT number, head_sha, baseline_sha, started_at, submitted_head_sha, submitted_at,
              finished_at
       FROM review_rounds
       WHERE pull_request_id = ?
       ORDER BY number`,
    )
    .all(pullRequestId) as unknown as ReviewRoundRow[];
}

function toRound(row: ReviewRoundRow): ReviewRound {
  return {
    number: row.number,
    headSha: row.head_sha,
    baselineSha: row.baseline_sha,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    finishedAt: row.finished_at,
  };
}

// Opens the first round, or the next one when the latest round was submitted and the head has
// moved since. The next round starts without the drafts the last one left.
function startRound(db: DatabaseSync, pullRequestId: number, headSha: string): ReviewRoundRow[] {
  const rounds = selectRounds(db, pullRequestId);
  const latest = rounds.at(-1);
  if (!latest) {
    db.prepare(
      'INSERT INTO review_rounds (pull_request_id, number, head_sha) VALUES (?, 1, ?)',
    ).run(pullRequestId, headSha);
  } else if (latest.submitted_head_sha !== null && latest.submitted_head_sha !== headSha) {
    db.prepare(
      `INSERT INTO review_rounds (pull_request_id, number, head_sha, baseline_sha)
       VALUES (?, ?, ?, ?)`,
    ).run(pullRequestId, latest.number + 1, headSha, latest.submitted_head_sha);
    db.prepare('DELETE FROM review_drafts WHERE pull_request_id = ?').run(pullRequestId);
  } else {
    return rounds;
  }
  return selectRounds(db, pullRequestId);
}

// Every round of the pull request, oldest first. headSha is the head on show, which starts the
// next round when the last one was submitted at another commit.
export function syncReviewRounds(
  db: DatabaseSync,
  pullRequestId: number,
  headSha: string,
): ReviewRound[] {
  return transaction(db, () => startRound(db, pullRequestId, headSha)).map(toRound);
}

// Ends the latest round at the head that was submitted. Submitting again in the same round
// moves the end to the later head.
export function endReviewRound(db: DatabaseSync, pullRequestId: number, headSha: string): void {
  transaction(db, () => {
    const latest = startRound(db, pullRequestId, headSha).at(-1);
    db.prepare(
      `UPDATE review_rounds
       SET submitted_head_sha = ?, submitted_at = ${NOW}
       WHERE pull_request_id = ? AND number = ?`,
    ).run(headSha, pullRequestId, latest?.number ?? 1);
  });
}

// Marks the latest round finished. Finishing again keeps the first time.
export function finishReviewRound(db: DatabaseSync, pullRequestId: number): void {
  db.prepare(
    `UPDATE review_rounds
     SET finished_at = COALESCE(finished_at, ${NOW})
     WHERE pull_request_id = ?
       AND number = (SELECT MAX(number) FROM review_rounds WHERE pull_request_id = ?)`,
  ).run(pullRequestId, pullRequestId);
}
