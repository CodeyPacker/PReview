import { z } from 'zod';
import { commitShaSchema } from './pull-request-files.ts';
import { diffSideSchema } from './review-drafts.ts';

export const reviewVerdictSchema = z.enum(['approve', 'request-changes', 'comment']);
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;

export const submitReviewInputSchema = z.object({
  pullRequestId: z.number().int(),
  // The commits of the diff the reviewer was looking at.
  headSha: commitShaSchema,
  mergeBase: commitShaSchema,
  // Drafts written on that diff to publish as line comments. Each must be inside a diff hunk.
  draftIds: z.array(z.number().int()),
  verdict: reviewVerdictSchema,
  body: z.string().max(65_536),
});
export type SubmitReviewInput = z.infer<typeof submitReviewInputSchema>;

// rejected: the provider refused the review. The message says why and is safe to show.
export const submitReviewResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('submitted') }),
  z.object({ status: z.literal('rejected'), message: z.string() }),
]);
export type SubmitReviewResult = z.infer<typeof submitReviewResultSchema>;

export const mergeMethodSchema = z.enum(['merge', 'squash', 'rebase']);
export type MergeMethod = z.infer<typeof mergeMethodSchema>;

export const mergePullRequestInputSchema = z.object({
  pullRequestId: z.number().int(),
  // The commit the reviewer looked at. The merge is refused if the branch has moved past it.
  headSha: commitShaSchema,
  method: mergeMethodSchema,
});
export type MergePullRequestInput = z.infer<typeof mergePullRequestInputSchema>;

// rejected: the provider refused the merge. The message says why and is safe to show.
export const mergePullRequestResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('merged') }),
  z.object({ status: z.literal('rejected'), message: z.string() }),
]);
export type MergePullRequestResult = z.infer<typeof mergePullRequestResultSchema>;

export const deleteBranchInputSchema = z.object({ pullRequestId: z.number().int() });
export type DeleteBranchInput = z.infer<typeof deleteBranchInputSchema>;

// rejected: the provider refused to delete the branch. The message says why and is safe to show.
export const deleteBranchResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('deleted') }),
  z.object({ status: z.literal('rejected'), message: z.string() }),
]);
export type DeleteBranchResult = z.infer<typeof deleteBranchResultSchema>;

export const reviewThreadCommentSchema = z.object({
  id: z.string(),
  // null when the account was deleted.
  author: z.object({ login: z.string(), avatarUrl: z.string() }).nullable(),
  body: z.string(),
  createdAt: z.string(),
  url: z.string(),
});
export type ReviewThreadComment = z.infer<typeof reviewThreadCommentSchema>;

// A published discussion on lines of one side of a file's diff. It runs from startLine to
// line, or is on line alone when startLine is null. line is null when the thread is on a file
// as a whole or its lines are no longer in the pull request's diff.
export const reviewThreadSchema = z.object({
  id: z.string(),
  path: z.string(),
  side: diffSideSchema,
  startLine: z.number().int().positive().nullable(),
  line: z.number().int().positive().nullable(),
  resolved: z.boolean(),
  // The code under the thread changed after it was written.
  outdated: z.boolean(),
  // Oldest first.
  comments: z.array(reviewThreadCommentSchema),
});
export type ReviewThread = z.infer<typeof reviewThreadSchema>;

export const replyToThreadInputSchema = z.object({
  threadId: z.string(),
  body: z.string().trim().min(1).max(65_536),
});
export type ReplyToThreadInput = z.infer<typeof replyToThreadInputSchema>;

export const setThreadResolvedInputSchema = z.object({
  threadId: z.string(),
  resolved: z.boolean(),
});
export type SetThreadResolvedInput = z.infer<typeof setThreadResolvedInputSchema>;

// rejected: the provider refused the change to the thread. The message says why and is safe
// to show.
export const threadActionResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('saved') }),
  z.object({ status: z.literal('rejected'), message: z.string() }),
]);
export type ThreadActionResult = z.infer<typeof threadActionResultSchema>;
