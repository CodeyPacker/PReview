import type { DatabaseSync } from 'node:sqlite';
import type {
  DeleteBranchInput,
  DeleteBranchResult,
  MergePullRequestInput,
  MergePullRequestResult,
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

// Publishes reviews to the provider, merges pull requests and deletes their branches.
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
    const { repository, number } = this.find(pullRequestId);

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
      await this.deps.provider.submitReview(repository, number, {
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

  // Merges the pull request if its branch is still at headSha.
  async merge({
    pullRequestId,
    headSha,
    method,
  }: MergePullRequestInput): Promise<MergePullRequestResult> {
    const { repository, number } = this.find(pullRequestId);
    try {
      await this.deps.provider.mergePullRequest(repository, number, headSha, method);
    } catch (error) {
      // These are GitHub refusing the merge, such as failing checks, a method the repository
      // turns off, or no permission. 409 is the branch having moved past the reviewed commit.
      if (error instanceof GitHubApiError && [403, 405, 409, 422].includes(error.status)) {
        return {
          status: 'rejected',
          message:
            error.status === 409
              ? 'The branch has new commits since you reviewed it. Reload and review them first.'
              : (error.detail ?? 'GitHub did not merge this pull request.'),
        };
      }
      throw error;
    }
    return { status: 'merged' };
  }

  // Deletes the pull request's branch, such as after it merged.
  async deleteBranch({ pullRequestId }: DeleteBranchInput): Promise<DeleteBranchResult> {
    const { repository, headBranch } = this.find(pullRequestId);
    try {
      await this.deps.provider.deleteBranch(repository, headBranch);
    } catch (error) {
      // These are GitHub refusing, such as a protected branch, no permission, or the branch
      // already being gone.
      if (error instanceof GitHubApiError && [403, 404, 422].includes(error.status)) {
        return {
          status: 'rejected',
          message: error.detail ?? 'GitHub did not delete this branch.',
        };
      }
      throw error;
    }
    return { status: 'deleted' };
  }

  private find(pullRequestId: number) {
    const row = this.deps.db
      .prepare(
        `SELECT p.number, p.head_branch, r.github_owner, r.github_name
         FROM pull_requests p
         JOIN repositories r ON r.id = p.repository_id
         WHERE p.id = ?`,
      )
      .get(pullRequestId) as
      | {
          number: number;
          head_branch: string;
          github_owner: string | null;
          github_name: string | null;
        }
      | undefined;
    if (!row?.github_owner || !row.github_name) throw new Error('Pull request not found.');
    return {
      repository: `${row.github_owner}/${row.github_name}`,
      number: row.number,
      headBranch: row.head_branch,
    };
  }
}
