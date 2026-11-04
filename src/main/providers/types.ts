// The provider interface the rest of the app talks to. GitHub is the only adapter in the MVP.

import type { AgentCheck } from '../../shared/contracts/agent-tasks.ts';
import type { DiffHunk, PullRequestFile } from '../../shared/contracts/pull-request-files.ts';
import type { ReviewThread } from '../../shared/contracts/pull-request-reviews.ts';

export type ProviderName = 'github';

export interface ProviderRepository {
  provider: ProviderName;
  // The provider's own identifier.
  providerId: string;
  // owner/name. Pass it to getPullRequests.
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  // Whether the signed-in user can push, which merging needs.
  canPush: boolean;
}

export interface ProviderPullRequest {
  provider: ProviderName;
  // The provider's own identifier.
  providerId: string;
  number: number;
  title: string;
  draft: boolean;
  url: string;
  // bot is true for GitHub Apps and other automated accounts.
  author: { login: string; avatarUrl: string; bot: boolean } | null;
  headBranch: string;
  headSha: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderChangedFile {
  path: string;
  // The file's id at the pull request head. Changes when the file's content changes.
  blobSha: string;
  // The path before a rename or copy.
  previousPath: string | null;
  status: PullRequestFile['status'];
  additions: number;
  deletions: number;
  // null when the provider shows no diff for the file.
  hunks: DiffHunk[] | null;
}

// Where a pull request is now. Read live, because the synced copy can be a minute old.
export interface ProviderPullRequestRefs {
  headSha: string;
  baseBranch: string;
}

export type ReviewVerdict = 'approve' | 'request-changes' | 'comment';

// A comment on lines of one side of a file's diff. It runs from startLine to line, or is on
// line alone when startLine is null. The lines must be inside one diff hunk.
export interface ProviderReviewComment {
  path: string;
  side: 'original' | 'modified';
  startLine: number | null;
  line: number;
  body: string;
}

export interface ProviderReview {
  verdict: ReviewVerdict;
  // The summary shown with the review. Required for comment and request-changes.
  body: string;
  // The commit the reviewer looked at.
  headSha: string;
  // Line comments published with the review.
  comments: ProviderReviewComment[];
}

export interface ProviderPullRequestDetails {
  // Empty when it has none.
  description: string;
  files: ProviderFilePatch[];
}

export interface ProviderFilePatch {
  path: string;
  previousPath: string | null;
  status: PullRequestFile['status'];
  additions: number;
  deletions: number;
  // The unified diff. null when the provider shows none, for example for a large file.
  patch: string | null;
}

export interface ProviderPublishedReview {
  id: string;
  // Empty when the review has none.
  body: string;
}

export interface ProviderCommit {
  sha: string;
  // The first line of the commit message.
  subject: string;
  authorLogin: string | null;
}

export interface ProviderCommitChanges {
  // The commit's first parent, which its diff is taken against.
  parentSha: string;
  files: ProviderChangedFile[];
}

export type MergeMethod = 'merge' | 'squash' | 'rebase';

// Every method takes the repository first, so a provider with several accounts can send each
// call with the account that owns the repository.
export interface GitProvider {
  // Open pull requests whose branch is in the same repository. Fork-origin pull requests are
  // left out, because the MVP does not review them.
  getPullRequests(repositoryFullName: string): Promise<ProviderPullRequest[]>;
  // The pull request's current head commit and base branch.
  getPullRequestRefs(repositoryFullName: string, number: number): Promise<ProviderPullRequestRefs>;
  // The files a pull request changes, in the order the provider lists them.
  getPullRequestFiles(repositoryFullName: string, number: number): Promise<ProviderChangedFile[]>;
  // The pull request's commits, oldest first.
  getPullRequestCommits(repositoryFullName: string, number: number): Promise<ProviderCommit[]>;
  // The files one commit changes, against its first parent.
  getCommitChanges(repositoryFullName: string, sha: string): Promise<ProviderCommitChanges>;
  // The files that differ between two commits.
  getChangesBetween(
    repositoryFullName: string,
    baseSha: string,
    headSha: string,
  ): Promise<ProviderChangedFile[]>;
  // The paths of every file in the repository at a commit. truncated when the provider's
  // listing is cut short, so the paths are not all of them.
  getRepositoryFiles(
    repositoryFullName: string,
    ref: string,
  ): Promise<{ paths: string[]; truncated: boolean }>;
  // The commit the pull request branched from, which its diff is taken against.
  getMergeBase(repositoryFullName: string, baseBranch: string, headSha: string): Promise<string>;
  // A file's text at a commit. undefined when the file does not exist there.
  getFileContent(
    repositoryFullName: string,
    path: string,
    ref: string,
  ): Promise<string | undefined>;
  // A file's bytes at a commit, for files that are not text. undefined when it does not exist.
  getFileBytes(
    repositoryFullName: string,
    path: string,
    ref: string,
  ): Promise<Uint8Array | undefined>;
  // The pull request's published review threads, with their comments.
  getReviewThreads(repositoryFullName: string, number: number): Promise<ReviewThread[]>;
  // Posts a reply to a review thread.
  replyToThread(repositoryFullName: string, threadId: string, body: string): Promise<void>;
  // Resolves a review thread, or reopens it.
  setThreadResolved(repositoryFullName: string, threadId: string, resolved: boolean): Promise<void>;
  // Publishes a review of the pull request and resolves with its id. Rejects with the
  // provider's explanation when the provider refuses it, for example when the author tries to
  // approve their own pull request.
  submitReview(
    repositoryFullName: string,
    number: number,
    review: ProviderReview,
  ): Promise<{ id: string }>;
  // The pull request's description and each changed file's diff, for an agent's task.
  getPullRequestDetails(
    repositoryFullName: string,
    number: number,
  ): Promise<ProviderPullRequestDetails>;
  // The CI checks on a commit of the pull request, with whether each is required for it.
  getChecks(repositoryFullName: string, number: number, sha: string): Promise<AgentCheck[]>;
  // The pull request's published reviews, oldest first.
  getReviews(repositoryFullName: string, number: number): Promise<ProviderPublishedReview[]>;
  // Merges the pull request if its head is still headSha. Rejects with the provider's
  // explanation when the provider refuses, for example when checks are required or the head
  // moved.
  mergePullRequest(
    repositoryFullName: string,
    number: number,
    headSha: string,
    method: MergeMethod,
  ): Promise<void>;
  // Deletes a branch of the repository.
  deleteBranch(repositoryFullName: string, branch: string): Promise<void>;
}
