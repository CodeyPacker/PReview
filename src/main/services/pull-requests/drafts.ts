import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateReviewDraftInput,
  ReviewDraft,
  UpdateReviewDraftInput,
} from '../../../shared/contracts/review-drafts.ts';

interface ReviewDraftRow {
  id: number;
  pull_request_id: number;
  head_sha: string;
  merge_base: string;
  path: string;
  side: ReviewDraft['side'];
  start_line: number | null;
  line: number;
  body: string;
  created_at: string;
  updated_at: string;
}

function toDraft(row: ReviewDraftRow): ReviewDraft {
  return {
    id: row.id,
    pullRequestId: row.pull_request_id,
    headSha: row.head_sha,
    mergeBase: row.merge_base,
    path: row.path,
    side: row.side,
    startLine: row.start_line,
    line: row.line,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Every draft of a pull request, at every revision, oldest first.
export function listReviewDrafts(db: DatabaseSync, pullRequestId: number): ReviewDraft[] {
  const rows = db
    .prepare(
      `SELECT id, pull_request_id, head_sha, merge_base, path, side, start_line, line, body,
              created_at,
              updated_at
       FROM review_drafts
       WHERE pull_request_id = ?
       ORDER BY created_at, id`,
    )
    .all(pullRequestId) as unknown as ReviewDraftRow[];
  return rows.map(toDraft);
}

export function createReviewDraft(db: DatabaseSync, draft: CreateReviewDraftInput): ReviewDraft[] {
  db.prepare(
    `INSERT INTO review_drafts
       (pull_request_id, head_sha, merge_base, path, side, start_line, line, body)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    draft.pullRequestId,
    draft.headSha,
    draft.mergeBase,
    draft.path,
    draft.side,
    draft.startLine,
    draft.line,
    draft.body,
  );
  return listReviewDrafts(db, draft.pullRequestId);
}

export function updateReviewDraft(
  db: DatabaseSync,
  { pullRequestId, id, body }: UpdateReviewDraftInput,
): ReviewDraft[] {
  const { changes } = db
    .prepare(
      `UPDATE review_drafts
       SET body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND pull_request_id = ?`,
    )
    .run(body, id, pullRequestId);
  if (changes === 0) throw new Error('Draft not found.');
  return listReviewDrafts(db, pullRequestId);
}

// Deleting a draft that is already gone changes nothing.
export function deleteReviewDraft(
  db: DatabaseSync,
  pullRequestId: number,
  id: number,
): ReviewDraft[] {
  db.prepare('DELETE FROM review_drafts WHERE id = ? AND pull_request_id = ?').run(
    id,
    pullRequestId,
  );
  return listReviewDrafts(db, pullRequestId);
}
