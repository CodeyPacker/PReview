import { z } from 'zod';
import {
  agentChangeSchema,
  agentEventSchema,
  agentTaskIdInputSchema,
  agentTaskSchema,
  answerAgentQuestionInputSchema,
} from './agent-tasks.ts';
import { githubAuthStateSchema } from './github.ts';
import {
  repositoriesStateSchema,
  repositorySettingsPatchSchema,
  scanDepthSchema,
  watchedFolderSchema,
} from './repositories.ts';
import {
  commitShaSchema,
  pullRequestCommitSchema,
  pullRequestChangesSchema,
  repositoryFilesSchema,
  pullRequestFileDiffSchema,
} from './pull-request-files.ts';
import {
  deleteBranchInputSchema,
  deleteBranchResultSchema,
  mergePullRequestInputSchema,
  mergePullRequestResultSchema,
  replyToThreadInputSchema,
  reviewThreadSchema,
  setThreadResolvedInputSchema,
  submitReviewInputSchema,
  submitReviewResultSchema,
  queuedReviewSchema,
  threadActionResultSchema,
} from './pull-request-reviews.ts';
import { pullRequestsStateSchema } from './pull-requests.ts';
import {
  createReviewDraftInputSchema,
  reattachReviewDraftsInputSchema,
  reviewDraftSchema,
  updateReviewDraftInputSchema,
} from './review-drafts.ts';
import {
  createReviewFindingInputSchema,
  reviewFindingSchema,
  setFindingResolutionInputSchema,
  updateReviewFindingInputSchema,
} from './review-findings.ts';
import { fileReviewMarkSchema, setFileReviewMarkInputSchema } from './file-review-marks.ts';
import { mergedPullRequestSchema } from './merged-pull-requests.ts';
import { reviewCompletionSchema } from './review-completions.ts';
import { repositorySearchInputSchema, repositorySearchResultSchema } from './repository-search.ts';
import { reviewRoundSchema } from './review-rounds.ts';
import { reviewSessionSchema, saveReviewSessionInputSchema } from './review-sessions.ts';
import { settingsPatchSchema, settingsSchema } from './settings.ts';
import {
  characterIdSchema,
  outfitIdSchema,
  progressionSchema,
  progressStatsSchema,
  xpTransactionSchema,
} from './progression.ts';
import { achievementSchema } from './achievements.ts';

export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.enum(['darwin', 'win32', 'linux']),
  electronVersion: z.string(),
});
export type AppInfo = z.infer<typeof appInfoSchema>;

// Every IPC channel and the schemas its input and output must match.
// The main process validates both sides; the preload exposes one function per channel.
export const ipcContract = {
  'app.getInfo': { input: z.undefined(), output: appInfoSchema },
  'settings.getAll': { input: z.undefined(), output: settingsSchema },
  'settings.update': { input: settingsPatchSchema, output: settingsSchema },
  'github.getAuth': { input: z.undefined(), output: githubAuthStateSchema },
  'github.connect': { input: z.undefined(), output: githubAuthStateSchema },
  'github.connectWithCli': { input: z.undefined(), output: githubAuthStateSchema },
  'github.cancel': { input: z.undefined(), output: githubAuthStateSchema },
  'github.disconnect': { input: z.object({ login: z.string() }), output: githubAuthStateSchema },
  'folders.list': { input: z.undefined(), output: z.array(watchedFolderSchema) },
  // Opens the native folder picker. A canceled picker changes nothing.
  'folders.add': { input: z.undefined(), output: z.array(watchedFolderSchema) },
  'folders.setScanDepth': {
    input: z.object({ id: z.number().int(), scanDepth: scanDepthSchema }),
    output: z.array(watchedFolderSchema),
  },
  'folders.remove': {
    input: z.object({ id: z.number().int() }),
    output: z.array(watchedFolderSchema),
  },
  'repositories.list': { input: z.undefined(), output: repositoriesStateSchema },
  // Starts a scan and returns without waiting for it.
  'repositories.scan': { input: z.undefined(), output: repositoriesStateSchema },
  'repositories.updateSettings': {
    input: z.object({ id: z.number().int(), patch: repositorySettingsPatchSchema }),
    output: repositoriesStateSchema,
  },
  // Picks the GitHub account for a repository. null goes back to automatic assignment.
  'repositories.setAccount': {
    input: z.object({ id: z.number().int(), login: z.string().nullable() }),
    output: repositoriesStateSchema,
  },
  'pullRequests.list': { input: z.undefined(), output: pullRequestsStateSchema },
  // Starts a sync and returns without waiting for it.
  'pullRequests.refresh': { input: z.undefined(), output: pullRequestsStateSchema },
  // The files a pull request changes, read from the provider, with the commits they are at.
  'pullRequestFiles.list': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: pullRequestChangesSchema,
  },
  // The pull request's commits, oldest first.
  'pullRequestFiles.listCommits': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: z.array(pullRequestCommitSchema),
  },
  // The files one commit changes, against its parent.
  'pullRequestFiles.listCommit': {
    input: z.object({ pullRequestId: z.number().int(), sha: commitShaSchema }),
    output: pullRequestChangesSchema,
  },
  // The files that changed between a reviewed commit and the head.
  'pullRequestFiles.listSince': {
    input: z.object({
      pullRequestId: z.number().int(),
      baselineSha: commitShaSchema,
      headSha: commitShaSchema,
    }),
    output: pullRequestChangesSchema,
  },
  // Every file of the repository at a commit of the pull request.
  'pullRequestFiles.listRepositoryFiles': {
    input: z.object({ pullRequestId: z.number().int(), headSha: commitShaSchema }),
    output: repositoryFilesSchema,
  },
  // One file at the commits that list returned.
  'pullRequestFiles.getDiff': {
    input: z.object({
      pullRequestId: z.number().int(),
      headSha: commitShaSchema,
      mergeBase: commitShaSchema,
      path: z.string(),
      previousPath: z.string().nullable(),
    }),
    output: pullRequestFileDiffSchema,
  },
  // The pull request's published review threads, read from the provider.
  'pullRequestReviews.listThreads': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: z.array(reviewThreadSchema),
  },
  // Posts a reply to a thread on the provider.
  'pullRequestReviews.replyToThread': {
    input: replyToThreadInputSchema,
    output: threadActionResultSchema,
  },
  // Resolves or reopens a thread on the provider.
  'pullRequestReviews.setThreadResolved': {
    input: setThreadResolvedInputSchema,
    output: threadActionResultSchema,
  },
  // Publishes a review to the provider.
  'pullRequestReviews.submit': {
    input: submitReviewInputSchema,
    output: submitReviewResultSchema,
  },
  // The pull request's review waiting to be sent. Null when none is.
  'pullRequestReviews.getQueued': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: queuedReviewSchema.nullable(),
  },
  // Merges a pull request on the provider.
  'pullRequestReviews.merge': {
    input: mergePullRequestInputSchema,
    output: mergePullRequestResultSchema,
  },
  // The saved summary of a merged pull request. Null when it wasn't merged here.
  'mergedPullRequests.get': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: mergedPullRequestSchema.nullable(),
  },
  // Deletes a pull request's branch on the provider.
  'pullRequestReviews.deleteBranch': {
    input: deleteBranchInputSchema,
    output: deleteBranchResultSchema,
  },
  // Unsent line comments, kept on this machine. Each call returns the pull request's drafts.
  'reviewDrafts.list': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: z.array(reviewDraftSchema),
  },
  'reviewDrafts.create': {
    input: createReviewDraftInputSchema,
    output: z.array(reviewDraftSchema),
  },
  'reviewDrafts.update': {
    input: updateReviewDraftInputSchema,
    output: z.array(reviewDraftSchema),
  },
  // Moves the drafts written on older commits to the commits on show, or marks them outdated.
  'reviewDrafts.reattach': {
    input: reattachReviewDraftsInputSchema,
    output: z.array(reviewDraftSchema),
  },
  'reviewDrafts.delete': {
    input: z.object({ pullRequestId: z.number().int(), id: z.number().int() }),
    output: z.array(reviewDraftSchema),
  },
  // Problems not tied to a code line, kept on this machine. Each call returns the pull
  // request's findings.
  'reviewFindings.list': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: z.array(reviewFindingSchema),
  },
  'reviewFindings.create': {
    input: createReviewFindingInputSchema,
    output: z.array(reviewFindingSchema),
  },
  'reviewFindings.update': {
    input: updateReviewFindingInputSchema,
    output: z.array(reviewFindingSchema),
  },
  'reviewFindings.setResolution': {
    input: setFindingResolutionInputSchema,
    output: z.array(reviewFindingSchema),
  },
  'reviewFindings.delete': {
    input: z.object({ pullRequestId: z.number().int(), id: z.number().int() }),
    output: z.array(reviewFindingSchema),
  },
  'fileReviewMarks.list': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: z.array(fileReviewMarkSchema),
  },
  'fileReviewMarks.set': {
    input: setFileReviewMarkInputSchema,
    output: z.array(fileReviewMarkSchema),
  },
  // Null until the reviewer finishes the review.
  'reviewCompletions.get': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: reviewCompletionSchema.nullable(),
  },
  // Finishing a review that is already finished returns the first completion.
  'reviewCompletions.finish': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: reviewCompletionSchema,
  },
  // Every round of the pull request, oldest first. headSha is the head on show. It starts the
  // next round when the last one was submitted at another commit, and that drops the drafts.
  'reviewRounds.sync': {
    input: z.object({ pullRequestId: z.number().int(), headSha: commitShaSchema }),
    output: z.array(reviewRoundSchema),
  },
  // Text search in every file of the repository at a commit of the pull request.
  'repositorySearch.search': {
    input: repositorySearchInputSchema,
    output: repositorySearchResultSchema,
  },
  // Where the reviewer left off in a pull request. Null before it was first opened.
  'reviewSessions.get': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: reviewSessionSchema.nullable(),
  },
  'reviewSessions.save': {
    input: saveReviewSessionInputSchema,
    output: reviewSessionSchema,
  },
  // The pull request whose review was open when the app last closed.
  'reviewSessions.getActive': { input: z.undefined(), output: z.number().int().nullable() },
  'reviewSessions.setActive': {
    input: z.object({ pullRequestId: z.number().int().nullable() }),
    output: z.null(),
  },
  // Account and character levels, from every XP award.
  'progression.get': { input: z.undefined(), output: progressionSchema },
  // Picks the character new reviews earn XP for. It must be unlocked.
  'progression.setActiveCharacter': {
    input: z.object({ characterId: characterIdSchema }),
    output: progressionSchema,
  },
  // Review numbers for the Dashboard.
  'progression.getStats': { input: z.undefined(), output: progressStatsSchema },
  // The XP one pull request earned, oldest first. Kept after it closes.
  'progression.listXp': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: z.array(xpTransactionSchema),
  },
  // Every achievement with its progress, in definition order.
  'achievements.list': { input: z.undefined(), output: z.array(achievementSchema) },
  // Dresses a character in an unlocked outfit.
  'progression.setOutfit': {
    input: z.object({ characterId: characterIdSchema, outfitId: outfitIdSchema }),
    output: progressionSchema,
  },
  // Adds focused time on a review screen. The main process caps each report.
  'progression.addReviewTime': {
    input: z.object({ pullRequestId: z.number().int(), ms: z.number().int().min(0) }),
    output: z.null(),
  },
  // Every agent task, newest first, with the question it waits on.
  'agentTasks.list': { input: z.undefined(), output: z.array(agentTaskSchema) },
  // A task's activity feed, oldest first.
  'agentTasks.listActivity': { input: agentTaskIdInputSchema, output: z.array(agentEventSchema) },
  // Stops a task after its current step.
  'agentTasks.stop': { input: agentTaskIdInputSchema, output: z.null() },
  // Ends a running task's agent at once.
  'agentTasks.forceStop': { input: agentTaskIdInputSchema, output: z.null() },
  // Queues a stopped or failed task again.
  'agentTasks.resume': { input: agentTaskIdInputSchema, output: z.null() },
  // Commits and pushes a completed task's changes.
  'agentTasks.push': { input: agentTaskIdInputSchema, output: z.null() },
  // A task's changes that aren't pushed yet.
  'agentTasks.changes': { input: agentTaskIdInputSchema, output: z.array(agentChangeSchema) },
  // Sends a task's agent back to find out why CI failed on its pushed commit.
  'agentTasks.investigate': { input: agentTaskIdInputSchema, output: z.null() },
  // Answers an agent's question. false when it was no longer waiting.
  'agentTasks.answer': { input: answerAgentQuestionInputSchema, output: z.boolean() },
} satisfies Record<string, { input: z.ZodType; output: z.ZodType }>;

export type IpcChannel = keyof typeof ipcContract;
export type IpcInput<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['output']>;
