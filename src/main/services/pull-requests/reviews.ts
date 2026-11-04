import { randomUUID } from 'node:crypto';
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
import type {
  GitProvider,
  ProviderChangedFile,
  ProviderReviewComment,
} from '../../providers/types.ts';
import type {
  ReattachReviewDraftsInput,
  ReviewDraft,
} from '../../../shared/contracts/review-drafts.ts';
import { listReviewDrafts } from './drafts.ts';
import { findingsMarkdown, listReviewFindings } from './findings.ts';
import { recordSentComments, syncCommentResolutions } from './comments.ts';
import { saveMergedPullRequest } from './merged.ts';
import { moveLines } from './reattach.ts';
import { endReviewRound } from './rounds.ts';

// GitHub lists at most this many files for a comparison, so a longer list may be cut short.
const MAX_COMPARED_FILES = 300;

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

// Hidden in a review's body, so a retry can find the review on GitHub. Markdown doesn't show it.
const marker = (submissionId: string) => `<!-- preview-submission:${submissionId} -->`;

export interface PullRequestReviewsDeps {
  db: DatabaseSync;
  provider: GitProvider;
}

// Reads and answers review threads, publishes reviews, merges pull requests and deletes their
// branches.
export class PullRequestReviews {
  // Pull requests with a review being sent or checked, so two never overlap.
  private readonly sending = new Set<number>();

  constructor(private readonly deps: PullRequestReviewsDeps) {}

  // The pull request's published review threads. Reading them also brings the sent
  // comments' resolutions up to date, which may award XP.
  async listThreads(pullRequestId: number): Promise<ReviewThread[]> {
    const { repository, number } = this.find(pullRequestId);
    const threads = await this.deps.provider.getReviewThreads(repository, number);
    syncCommentResolutions(this.deps.db, pullRequestId, threads);
    return threads;
  }

  // Posts a reply to a thread straight away, as GitHub's single comments do.
  async reply({ pullRequestId, threadId, body }: ReplyToThreadInput): Promise<ThreadActionResult> {
    const { repository } = this.find(pullRequestId);
    return this.changeThread(
      () => this.deps.provider.replyToThread(repository, threadId, body.trim()),
      'GitHub did not accept this reply.',
    );
  }

  // Resolves a thread, or reopens it.
  async setThreadResolved({
    pullRequestId,
    threadId,
    resolved,
  }: SetThreadResolvedInput): Promise<ThreadActionResult> {
    const { repository } = this.find(pullRequestId);
    return this.changeThread(
      () => this.deps.provider.setThreadResolved(repository, threadId, resolved),
      resolved ? 'GitHub did not resolve this thread.' : 'GitHub did not reopen this thread.',
    );
  }

  // Moves the drafts written on older commits to the commits on show. A draft moves when the
  // commits in between changed nothing near its lines. Otherwise it is marked outdated and
  // stays at its old line. Nothing is deleted.
  async reattachDrafts({
    pullRequestId,
    headSha,
    mergeBase,
  }: ReattachReviewDraftsInput): Promise<ReviewDraft[]> {
    const stale = listReviewDrafts(this.deps.db, pullRequestId).filter(
      (draft) => draft.headSha !== headSha || draft.mergeBase !== mergeBase,
    );
    if (stale.length === 0) return listReviewDrafts(this.deps.db, pullRequestId);

    // A comment on the old file is anchored to the merge base, so only a new merge base moves
    // it. A comment on the new file moves with the commits since it was written.
    const movable = (draft: ReviewDraft) =>
      !draft.outdated && draft.mergeBase === mergeBase && draft.side === 'modified';
    const { repository } = this.find(pullRequestId);
    const changes = new Map<string, ProviderChangedFile[] | null>();
    for (const sha of new Set(stale.filter(movable).map((draft) => draft.headSha))) {
      changes.set(sha, await this.compare(repository, sha, headSha));
    }

    const place = (draft: ReviewDraft): { startLine: number | null; line: number } | null => {
      if (draft.outdated || draft.mergeBase !== mergeBase) return null;
      if (draft.side === 'original') return { startLine: draft.startLine, line: draft.line };
      const compared = changes.get(draft.headSha);
      if (!compared || compared.length >= MAX_COMPARED_FILES) return null;
      // A file that moved or was removed can't be followed.
      if (compared.some((file) => file.previousPath === draft.path)) return null;
      const file = compared.find((item) => item.path === draft.path);
      if (!file) return { startLine: draft.startLine, line: draft.line };
      if (file.hunks === null || (file.status !== 'modified' && file.status !== 'changed')) {
        return null;
      }
      const moved = moveLines(file.hunks, draft.startLine ?? draft.line, draft.line);
      if (!moved) return null;
      return { startLine: draft.startLine === null ? null : moved.startLine, line: moved.endLine };
    };

    const update = this.deps.db.prepare(
      `UPDATE review_drafts
       SET head_sha = ?, merge_base = ?, start_line = ?, line = ?, outdated = ?
       WHERE id = ?`,
    );
    transaction(this.deps.db, () => {
      for (const draft of stale) {
        const placed = place(draft);
        update.run(
          headSha,
          mergeBase,
          placed ? placed.startLine : draft.startLine,
          placed ? placed.line : draft.line,
          placed ? 0 : 1,
          draft.id,
        );
      }
    });
    return listReviewDrafts(this.deps.db, pullRequestId);
  }

  // Publishes the review with the chosen drafts as line comments and the chosen findings in
  // its body. Then it deletes those drafts, marks those findings published and ends the round.
  // With sendToAgent it also queues an agent task for the review.
  //
  // The review is saved before it is sent, with its id hidden in the body. If the connection
  // drops while sending, the next submit or the next start checks GitHub for that id, so the
  // review is never posted twice.
  async submit(input: SubmitReviewInput): Promise<SubmitReviewResult> {
    if (this.sending.has(input.pullRequestId)) {
      return { status: 'rejected', message: 'This review is already being sent.' };
    }
    this.sending.add(input.pullRequestId);
    try {
      return await this.publish(input);
    } finally {
      this.sending.delete(input.pullRequestId);
    }
  }

  // Settles every review a crash or lost connection left unconfirmed. Called at startup.
  async recoverSubmissions(): Promise<void> {
    const rows = this.deps.db
      .prepare(`SELECT DISTINCT pull_request_id FROM review_submissions WHERE state = 'publishing'`)
      .all() as { pull_request_id: number }[];
    for (const { pull_request_id: pullRequestId } of rows) {
      // A submit in progress settles them itself.
      if (this.sending.has(pullRequestId)) continue;
      this.sending.add(pullRequestId);
      try {
        await this.recover(pullRequestId);
      } finally {
        this.sending.delete(pullRequestId);
      }
    }
  }

  private async publish({
    pullRequestId,
    headSha,
    mergeBase,
    draftIds,
    findingIds,
    verdict,
    body,
    sendToAgent = false,
  }: SubmitReviewInput): Promise<SubmitReviewResult> {
    // GitHub refuses these two without a body. Say so before sending.
    if (verdict !== 'approve' && body.trim() === '' && findingIds.length === 0) {
      return { status: 'rejected', message: 'Write a summary to comment or request changes.' };
    }
    if (sendToAgent && draftIds.length === 0 && findingIds.length === 0) {
      return {
        status: 'rejected',
        message: 'Add a line comment or finding for the agent to work on.',
      };
    }
    const { repository, number } = this.find(pullRequestId);
    // An earlier review that may have reached GitHub would otherwise be sent again with
    // these drafts.
    const recovered = await this.recover(pullRequestId);

    const wanted = new Set(draftIds);
    const remaining = listReviewDrafts(this.deps.db, pullRequestId).filter((draft) =>
      wanted.has(draft.id),
    );
    const drafts = remaining.filter(
      (draft) => !draft.outdated && draft.headSha === headSha && draft.mergeBase === mergeBase,
    );
    const wantedFindings = new Set(findingIds);
    const findings = listReviewFindings(this.deps.db, pullRequestId).filter(
      (finding) => wantedFindings.has(finding.id) && finding.publishedAt === null,
    );
    // A retry of a review GitHub turned out to have. Its drafts and findings are now
    // published, so there is nothing left to send.
    if (recovered && remaining.length === 0 && findings.length === 0) {
      return { status: 'submitted' };
    }
    if (drafts.length !== wanted.size) {
      return {
        status: 'rejected',
        message: 'Some comments changed or were written on another version. Try again.',
      };
    }
    if (findings.length !== wantedFindings.size) {
      return { status: 'rejected', message: 'Some findings changed. Try again.' };
    }
    // The agent works on the branch as it is now, so the review must be of that.
    if (sendToAgent) {
      const refs = await this.deps.provider.getPullRequestRefs(repository, number);
      if (refs.headSha !== headSha) {
        return {
          status: 'rejected',
          message:
            'The branch has new commits since you reviewed it. Reload and review them first.',
        };
      }
    }

    const id = randomUUID();
    const comments: ProviderReviewComment[] = drafts.map(
      ({ path, side, startLine, line, body: text }) => ({
        path,
        side,
        startLine,
        line,
        body: text,
      }),
    );
    const text = [body.trim(), findings.length > 0 && findingsMarkdown(findings), marker(id)]
      .filter(Boolean)
      .join('\n\n');
    this.deps.db
      .prepare(
        `INSERT INTO review_submissions
           (id, pull_request_id, head_sha, verdict, body, comments, draft_ids, finding_ids,
            send_to_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        pullRequestId,
        headSha,
        verdict,
        body.trim(),
        JSON.stringify(comments),
        JSON.stringify(drafts.map((draft) => draft.id)),
        JSON.stringify(findings.map((finding) => finding.id)),
        sendToAgent ? 1 : 0,
      );

    let posted: { id: string };
    try {
      posted = await this.deps.provider.submitReview(repository, number, {
        verdict,
        body: text,
        headSha,
        comments,
      });
    } catch (error) {
      // 403 and 422 are GitHub refusing this review, such as approving your own pull
      // request or a comment outside the diff. Anything else is a failure to reach GitHub and
      // is thrown, leaving the review to be checked for later.
      if (error instanceof GitHubApiError && (error.status === 403 || error.status === 422)) {
        this.deps.db.prepare('DELETE FROM review_submissions WHERE id = ?').run(id);
        return {
          status: 'rejected',
          message: error.detail ?? 'GitHub did not accept this review.',
        };
      }
      throw error;
    }
    this.confirm(id, posted.id);
    return { status: 'submitted' };
  }

  // Asks GitHub whether each unconfirmed review of the pull request arrived. One that did is
  // confirmed. One that didn't is marked failed, and its drafts stay to be sent again.
  // Resolves with whether any was confirmed.
  private async recover(pullRequestId: number): Promise<boolean> {
    const pending = this.deps.db
      .prepare(
        `SELECT id FROM review_submissions WHERE pull_request_id = ? AND state = 'publishing'`,
      )
      .all(pullRequestId) as { id: string }[];
    if (pending.length === 0) return false;
    const { repository, number } = this.find(pullRequestId);
    const published = await this.deps.provider.getReviews(repository, number);
    let confirmed = false;
    for (const { id } of pending) {
      const review = published.find((item) => item.body.includes(marker(id)));
      if (review) {
        this.confirm(id, review.id);
        confirmed = true;
      } else {
        this.deps.db.prepare(`UPDATE review_submissions SET state = 'failed' WHERE id = ?`).run(id);
      }
    }
    return confirmed;
  }

  // Records that GitHub has the review: keeps its comments, deletes its drafts, marks its findings published,
  // queues its agent task and ends the round.
  private confirm(submissionId: string, providerReviewId: string): void {
    const row = this.deps.db
      .prepare(
        `SELECT pull_request_id, head_sha, draft_ids, finding_ids, send_to_agent
         FROM review_submissions WHERE id = ?`,
      )
      .get(submissionId) as {
      pull_request_id: number;
      head_sha: string;
      draft_ids: string;
      finding_ids: string;
      send_to_agent: number;
    };
    const remove = this.deps.db.prepare('DELETE FROM review_drafts WHERE id = ?');
    const publish = this.deps.db.prepare(
      `UPDATE review_findings SET published_at = ${NOW} WHERE id = ? AND published_at IS NULL`,
    );
    transaction(this.deps.db, () => {
      recordSentComments(this.deps.db, submissionId);
      (JSON.parse(row.draft_ids) as number[]).forEach((id) => remove.run(id));
      (JSON.parse(row.finding_ids) as number[]).forEach((id) => publish.run(id));
      this.deps.db
        .prepare(
          `UPDATE review_submissions
           SET state = 'published', provider_review_id = ?, published_at = ${NOW}
           WHERE id = ?`,
        )
        .run(providerReviewId, submissionId);
      if (row.send_to_agent === 1) {
        this.deps.db
          .prepare(
            `INSERT OR IGNORE INTO agent_tasks (submission_id, pull_request_id) VALUES (?, ?)`,
          )
          .run(submissionId, row.pull_request_id);
      }
    });
    endReviewRound(this.deps.db, row.pull_request_id, row.head_sha);
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
      // 404 is GitHub hiding the repository from an account that can't push to it.
      if (error instanceof GitHubApiError && [403, 404, 405, 409, 422].includes(error.status)) {
        return {
          status: 'rejected',
          message:
            error.status === 409
              ? 'The branch has new commits since you reviewed it. Reload and review them first.'
              : error.status === 404
                ? 'Your GitHub account can’t merge in this repository. Check that it has write access.'
                : (error.detail ?? 'GitHub did not merge this pull request.'),
        };
      }
      throw error;
    }
    saveMergedPullRequest(this.deps.db, pullRequestId, repository);
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

  // The files that changed between two commits, or null when GitHub no longer has one of them,
  // such as after a force push.
  private async compare(
    repository: string,
    baseSha: string,
    headSha: string,
  ): Promise<ProviderChangedFile[] | null> {
    try {
      return await this.deps.provider.getChangesBetween(repository, baseSha, headSha);
    } catch (error) {
      if (error instanceof GitHubApiError && (error.status === 404 || error.status === 422)) {
        return null;
      }
      throw error;
    }
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
