import type { DatabaseSync } from 'node:sqlite';
import type { ReviewThread } from '../../../shared/contracts/pull-request-reviews.ts';
import type { ProviderReviewComment } from '../../providers/types.ts';
import { awardComment } from '../progression/xp.ts';

// Keeps the comments of a review GitHub now has, with the category of the draft each came
// from. Call it before the drafts are deleted. Keeping them again changes nothing.
export function recordSentComments(db: DatabaseSync, submissionId: string): void {
  const row = db
    .prepare('SELECT pull_request_id, comments, draft_ids FROM review_submissions WHERE id = ?')
    .get(submissionId) as
    { pull_request_id: number; comments: string; draft_ids: string } | undefined;
  if (!row) return;
  const comments = JSON.parse(row.comments) as ProviderReviewComment[];
  const draftIds = JSON.parse(row.draft_ids) as number[];
  const categoryOf = db.prepare('SELECT category FROM review_drafts WHERE id = ?');
  const insert = db.prepare(
    `INSERT OR IGNORE INTO review_comments
       (pull_request_id, submission_id, position, path, line, body, category)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  comments.forEach((comment, index) => {
    const draft = categoryOf.get(draftIds[index] ?? -1) as { category: string | null } | undefined;
    insert.run(
      row.pull_request_id,
      submissionId,
      index + 1,
      comment.path,
      comment.line,
      comment.body,
      draft?.category ?? null,
    );
  });
}

// Marks each sent comment resolved or open to match its thread on GitHub, and awards the XP
// of the ones now resolved. A thread is a comment's when it is on the same file and starts
// with the comment's text, since its lines move with new commits.
export function syncCommentResolutions(
  db: DatabaseSync,
  pullRequestId: number,
  threads: readonly ReviewThread[],
): void {
  const comments = db
    .prepare('SELECT id, path, body, resolution FROM review_comments WHERE pull_request_id = ?')
    .all(pullRequestId) as { id: number; path: string; body: string; resolution: string }[];
  const update = db.prepare('UPDATE review_comments SET resolution = ? WHERE id = ?');
  for (const comment of comments) {
    const thread = threads.find(
      (candidate) =>
        candidate.path === comment.path &&
        candidate.comments[0]?.body.trim() === comment.body.trim(),
    );
    if (!thread) continue;
    const resolution = thread.resolved ? 'resolved' : 'open';
    if (resolution !== comment.resolution) update.run(resolution, comment.id);
    if (thread.resolved) awardComment(db, comment.id);
  }
}
