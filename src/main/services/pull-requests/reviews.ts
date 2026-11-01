import type { DatabaseSync } from 'node:sqlite';
import type {
  DeleteBranchInput,
  DeleteBranchResult,
  MergePullRequestInput,
  MergePullRequestResult,
  ReplyToThreadInput,
  ReviewThread,
  SetThreadResolvedInput,
  SubmitReviewInput,
  SubmitReviewResult,
  ThreadActionResult,
} from '../../../shared/contracts/pull-request-reviews.ts';
import { transaction } from '../../database/connection.ts';
import { GitHubApiError } from '../../providers/github/client.ts';
import type { GitProvider } from '../../providers/types.ts';
import { listReviewDrafts } from './drafts.ts';
import { findingsMarkdown, listReviewFindings } from './findings.ts';

export interface PullRequestReviewsDeps {
  db: DatabaseSync;
  provider: GitProvider;
}

// Reads and answers review threads, publishes reviews, merges pull requests and deletes their
// branches.
export class PullRequestReviews {
  constructor(private readonly deps: PullRequestReviewsDeps) {}

  // The pull request's published review threads.
  listThreads(pullRequestId: number): Promise<ReviewThread[]> {
    const { repository, number } = this.find(pullRequestId);
    return this.deps.provider.getReviewThreads(repository, number);
  }

  // Posts a reply to a thread straight away, as GitHub's single comments do.
  async reply({ threadId, body }: ReplyToThreadInput): Promise<ThreadActionResult> {
    return this.changeThread(
      () => this.deps.provider.replyToThread(threadId, body.trim()),
      'GitHub did not accept this reply.',
    );
  }

  // Resolves a thread, or reopens it.
  async setThreadResolved({
    threadId,
    resolved,
  }: SetThreadResolvedInput): Promise<ThreadActionResult> {
    return this.changeThread(
      () => this.deps.provider.setThreadResolved(threadId, resolved),
      resolved ? 'GitHub did not resolve this thread.' : 'GitHub did not reopen this thread.',
    );
  }

  // Publishes the review with the chosen drafts as line comments and the chosen findings in
  // its body. Then it deletes those drafts and marks those findings published.
  async submit({
    pullRequestId,
    headSha,
    mergeBase,
    draftIds,
    findingIds,
    verdict,
    body,
  }: SubmitReviewInput): Promise<SubmitReviewResult> {
    // GitHub refuses these two without a body. Say so before sending.
    if (verdict !== 'approve' && body.trim() === '' && findingIds.length === 0) {
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
    const wantedFindings = new Set(findingIds);
    const findings = listReviewFindings(this.deps.db, pullRequestId).filter(
      (finding) => wantedFindings.has(finding.id) && finding.publishedAt === null,
    );
    if (findings.length !== wantedFindings.size) {
      return { status: 'rejected', message: 'Some findings changed. Try again.' };
    }
    const text = [body.trim(), findings.length > 0 && findingsMarkdown(findings)]
      .filter(Boolean)
      .join('\n\n');

    try {
      await this.deps.provider.submitReview(repository, number, {
        verdict,
        body: text,
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
    const publish = this.deps.db.prepare(
      `UPDATE review_findings SET published_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    );
    transaction(this.deps.db, () => {
      drafts.forEach((draft) => remove.run(draft.id));
      findings.forEach((finding) => publish.run(finding.id));
    });
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

  private async changeThread(
    change: () => Promise<void>,
    fallback: string,
  ): Promise<ThreadActionResult> {
    try {
      await change();
    } catch (error) {
      // GraphQL reports a refusal, such as no permission or a deleted thread, as an error with
      // a 200. 403 and 422 are refusals too. Anything else is a failure to reach GitHub.
      if (error instanceof GitHubApiError && [200, 403, 422].includes(error.status)) {
        return { status: 'rejected', message: error.detail ?? fallback };
      }
      throw error;
    }
    return { status: 'saved' };
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
