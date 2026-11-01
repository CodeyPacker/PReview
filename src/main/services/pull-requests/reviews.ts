import type { DatabaseSync } from 'node:sqlite';
import type {
  SubmitReviewInput,
  SubmitReviewResult,
} from '../../../shared/contracts/pull-request-reviews.ts';
import { GitHubApiError } from '../../providers/github/client.ts';
import type { GitProvider } from '../../providers/types.ts';

export interface PullRequestReviewsDeps {
  db: DatabaseSync;
  provider: GitProvider;
}

// Publishes reviews to the provider.
export class PullRequestReviews {
  constructor(private readonly deps: PullRequestReviewsDeps) {}

  async submit({
    pullRequestId,
    headSha,
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

    try {
      await this.deps.provider.submitReview(`${row.github_owner}/${row.github_name}`, row.number, {
        verdict,
        body: body.trim(),
        headSha,
      });
      return { status: 'submitted' };
    } catch (error) {
      // 403 and 422 are GitHub refusing this review, such as approving your own pull
      // request. Anything else is a failure to reach GitHub and is thrown.
      if (error instanceof GitHubApiError && (error.status === 403 || error.status === 422)) {
        return {
          status: 'rejected',
          message: error.detail ?? 'GitHub did not accept this review.',
        };
      }
      throw error;
    }
  }
}
