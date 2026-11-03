import type { DatabaseSync } from 'node:sqlite';
import type { MergedPullRequest } from '../../../shared/contracts/merged-pull-requests.ts';

interface MergedRow {
  pull_request_id: number;
  repository: string;
  number: number;
  url: string;
  merged_at: string;
  comments: number;
  suggestions: number;
  bugs_caught: number;
  files_reviewed: number;
}

export function getMergedPullRequest(
  db: DatabaseSync,
  pullRequestId: number,
): MergedPullRequest | null {
  const row = db
    .prepare('SELECT * FROM merged_pull_requests WHERE pull_request_id = ?')
    .get(pullRequestId) as unknown as MergedRow | undefined;
  return row
    ? {
        pullRequestId: row.pull_request_id,
        repository: row.repository,
        number: row.number,
        url: row.url,
        mergedAt: row.merged_at,
        comments: row.comments,
        suggestions: row.suggestions,
        bugsCaught: row.bugs_caught,
        filesReviewed: row.files_reviewed,
      }
    : null;
}

const count = (db: DatabaseSync, sql: string, pullRequestId: number) =>
  (db.prepare(sql).get(pullRequestId) as { total: number | null }).total ?? 0;

// Saves what the reviewer did in the pull request, counted from what is stored now. Saving
// again replaces the summary.
export function saveMergedPullRequest(
  db: DatabaseSync,
  pullRequestId: number,
  repository: string,
): void {
  const pullRequest = db
    .prepare('SELECT number, url FROM pull_requests WHERE id = ?')
    .get(pullRequestId) as { number: number; url: string } | undefined;
  if (!pullRequest) return;
  // Sent drafts are deleted, so they are only in the submissions. A submission's comments
  // are a JSON array.
  const unsent = count(
    db,
    'SELECT COUNT(*) AS total FROM review_drafts WHERE pull_request_id = ?',
    pullRequestId,
  );
  const sent = count(
    db,
    `SELECT SUM(json_array_length(comments)) AS total FROM review_submissions
     WHERE pull_request_id = ? AND state = 'published'`,
    pullRequestId,
  );
  const suggestions = count(
    db,
    `SELECT COUNT(*) AS total FROM review_findings
     WHERE pull_request_id = ? AND category IN ('improvement', 'test') AND validation != 'rejected'`,
    pullRequestId,
  );
  const bugsCaught = count(
    db,
    `SELECT COUNT(*) AS total FROM review_findings
     WHERE pull_request_id = ? AND category IN ('bug', 'ui-bug', 'security')
       AND validation != 'rejected'`,
    pullRequestId,
  );
  const filesReviewed = count(
    db,
    'SELECT COUNT(*) AS total FROM file_review_marks WHERE pull_request_id = ?',
    pullRequestId,
  );
  db.prepare(
    `INSERT OR REPLACE INTO merged_pull_requests
       (pull_request_id, repository, number, url, comments, suggestions, bugs_caught,
        files_reviewed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    pullRequestId,
    repository,
    pullRequest.number,
    pullRequest.url,
    unsent + sent,
    suggestions,
    bugsCaught,
    filesReviewed,
  );
}
