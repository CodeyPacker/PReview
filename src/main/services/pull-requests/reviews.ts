import type { DatabaseSync } from 'node:sqlite';
import type {
  SubmitReviewInput,
  SubmitReviewResult,
} from '../../../shared/contracts/pull-request-reviews.ts';
import { transaction } from '../../database/connection.ts';
import { GitHubApiError } from '../../providers/github/client.ts';
import type { GitProvider } from '../../providers/types.ts';
import { listReviewDrafts } from './drafts.ts';

export interface PullRequestReviewsDeps {
  db: DatabaseSync;
  provider: GitProvider;
}

// Publishes reviews to the provider.
export class PullRequestReviews {
  constructor(private readonly deps: PullRequestReviewsDeps) {}

  // Publishes the review with the chosen drafts as line comments, then deletes those drafts.
  async submit({
    pullRequestId,
    headSha,
    mergeBase,
    draftIds,
    verdict,
    body,
  }: SubmitReviewInput): Promise<SubmitReviewResult> {
    // GitHub refuses these two without a summary. Say so before sending.
    if (verdict !== 'approve' && body.trim() === '') {
      return { status: 'rejected', message: 'Write a summary to comment or request changes.' };
    }
    const row = this.deps.db
      .prepare(
        `SELECT p.number, r.github_owner, r.github_name
         FROM pull_requests p
         JOIN repositories r ON r.id = p.repository_id
         WHERE p.id = ?`,
      )
      .get(pullRequestId) as
      { number: number; github_owner: string | null; github_name: string | null } | undefined;
    if (!row?.github_owner || !row.github_name) throw new Error('Pull request not found.');

    const wanted = new Set(draftIds);
    const drafts = listReviewDrafts(this.deps.db, pullRequestId).filter(
      (draft) => wanted.has(draft.id) && draft.headSha === headSha && draft.mergeBase === mergeBase,
    );
    if (drafts.length !== wanted.size) {
      return {
        status: 'rejected',
        message: 'Some comments changed or were written on another version. Try again.',
      };
    }

    try {
      await this.deps.provider.submitReview(`${row.github_owner}/${row.github_name}`, row.number, {
        verdict,
        body: body.trim(),
        headSha,
        comments: drafts.map(({ path, side, startLine, line, body: text }) => ({
          path,
          side,
          startLine,
          line,
          body: text,
        })),
      });
    } catch (error) {
      // 403 and 422 are GitHub refusing this review, such as approving your own pull
      // request or a comment outside the diff. Anything else is a failure to reach GitHub and
      // is thrown.
      if (error instanceof GitHubApiError && (error.status === 403 || error.status === 422)) {
        return {
          status: 'rejected',
          message: error.detail ?? 'GitHub did not accept this review.',
        };
      }
      throw error;
    }

    const remove = this.deps.db.prepare('DELETE FROM review_drafts WHERE id = ?');
    transaction(this.deps.db, () => drafts.forEach((draft) => remove.run(draft.id)));
    return { status: 'submitted' };
  }
}
