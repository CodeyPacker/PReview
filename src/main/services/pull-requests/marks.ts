import type { DatabaseSync } from 'node:sqlite';
import type {
  FileReviewMark,
  SetFileReviewMarkInput,
} from '../../../shared/contracts/file-review-marks.ts';

interface FileReviewMarkRow {
  path: string;
  state: FileReviewMark['state'];
  blob_sha: string;
}

export function listFileReviewMarks(db: DatabaseSync, pullRequestId: number): FileReviewMark[] {
  const rows = db
    .prepare(
      `SELECT path, state, blob_sha FROM file_review_marks
       WHERE pull_request_id = ? ORDER BY path`,
    )
    .all(pullRequestId) as unknown as FileReviewMarkRow[];
  return rows.map((row) => ({ path: row.path, state: row.state, blobSha: row.blob_sha }));
}

// Sets or, with a null state, removes the mark. Returns the pull request's marks.
export function setFileReviewMark(
  db: DatabaseSync,
  { pullRequestId, path, state, blobSha }: SetFileReviewMarkInput,
): FileReviewMark[] {
  if (state === null) {
    db.prepare('DELETE FROM file_review_marks WHERE pull_request_id = ? AND path = ?').run(
      pullRequestId,
      path,
    );
  } else {
    db.prepare(
      `INSERT INTO file_review_marks (pull_request_id, path, state, blob_sha)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (pull_request_id, path) DO UPDATE SET
         state = excluded.state,
         blob_sha = excluded.blob_sha`,
    ).run(pullRequestId, path, state, blobSha);
  }
  return listFileReviewMarks(db, pullRequestId);
}
