import type {
  AgentChange,
  AgentEvent,
  AgentTask,
  AnswerAgentQuestionInput,
} from './agent-tasks.ts';
import type { ExportBackupResult, RestoreBackupResult } from './backups.ts';
import type { GitHubAuthState } from './github.ts';
import type { NotificationsState } from './notifications.ts';
import type { InstallUpdateResult, UpdateState } from './updates.ts';
import type { AppInfo } from './ipc.ts';
import type {
  CharacterId,
  OutfitId,
  WeaponId,
  Progression,
  ProgressStats,
  XpTransaction,
} from './progression.ts';
import type { Achievement } from './achievements.ts';
import type {
  PullRequestChanges,
  RepositoryFiles,
  PullRequestCommit,
  PullRequestFileDiff,
} from './pull-request-files.ts';
import type {
  DeleteBranchInput,
  DeleteBranchResult,
  QueuedReview,
  MergePullRequestInput,
  MergePullRequestResult,
  ReplyToThreadInput,
  ReviewThread,
  SetThreadResolvedInput,
  SubmitReviewInput,
  SubmitReviewResult,
  ThreadActionResult,
} from './pull-request-reviews.ts';
import type { PullRequestsState } from './pull-requests.ts';
import type {
  CreateReviewDraftInput,
  ReattachReviewDraftsInput,
  ReviewDraft,
  UpdateReviewDraftInput,
} from './review-drafts.ts';
import type {
  CreateReviewFindingInput,
  ReviewFinding,
  SetFindingResolutionInput,
  UpdateReviewFindingInput,
} from './review-findings.ts';
import type { FileReviewMark, SetFileReviewMarkInput } from './file-review-marks.ts';
import type { RepositorySearchInput, RepositorySearchResult } from './repository-search.ts';
import type { MergedPullRequest } from './merged-pull-requests.ts';
import type { ReviewCompletion } from './review-completions.ts';
import type { ReviewRound } from './review-rounds.ts';
import type { ReviewSession, SaveReviewSessionInput } from './review-sessions.ts';
import type { RepositoriesState, RepositorySettingsPatch, WatchedFolder } from './repositories.ts';
import type { Settings, SettingsPatch } from './settings.ts';

// The API the preload script exposes to the renderer as `window.preview`.
// One function per IPC channel. Never expose ipcRenderer or Node APIs.
export interface PreviewApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  settings: {
    getAll(): Promise<Settings>;
    update(patch: SettingsPatch): Promise<Settings>;
  };
  backups: {
    export(): Promise<ExportBackupResult>;
    // Restarts PReview when the user goes ahead, so it resolves only on cancel or a bad file.
    restore(): Promise<RestoreBackupResult>;
  };
  notifications: {
    list(): Promise<NotificationsState>;
    markAllRead(): Promise<NotificationsState>;
    setQuiet(quiet: boolean): Promise<null>;
  };
  updates: {
    get(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    // Restarts PReview when it goes ahead.
    install(): Promise<InstallUpdateResult>;
  };
  github: {
    getAuth(): Promise<GitHubAuthState>;
    // Adds an account: opens GitHub's device page and copies the code. Resolves once the code
    // is ready.
    connect(): Promise<GitHubAuthState>;
    // Adds the GitHub CLI's active account. Resolves once connected or failed.
    connectWithCli(): Promise<GitHubAuthState>;
    cancel(): Promise<GitHubAuthState>;
    disconnect(login: string): Promise<GitHubAuthState>;
  };
  folders: {
    list(): Promise<WatchedFolder[]>;
    // Opens the native folder picker and watches the chosen folder.
    add(): Promise<WatchedFolder[]>;
    setScanDepth(id: number, scanDepth: number): Promise<WatchedFolder[]>;
    remove(id: number): Promise<WatchedFolder[]>;
  };
  repositories: {
    list(): Promise<RepositoriesState>;
    // Starts a scan of the watched folders. Resolves without waiting for it to finish.
    scan(): Promise<RepositoriesState>;
    updateSettings(id: number, patch: RepositorySettingsPatch): Promise<RepositoriesState>;
    // Picks the GitHub account for a repository. null goes back to automatic assignment.
    setAccount(id: number, login: string | null): Promise<RepositoriesState>;
  };
  pullRequests: {
    list(): Promise<PullRequestsState>;
    // Starts a sync with GitHub. Resolves without waiting for it to finish.
    refresh(): Promise<PullRequestsState>;
  };
  pullRequestFiles: {
    list(pullRequestId: number): Promise<PullRequestChanges>;
    listCommits(pullRequestId: number): Promise<PullRequestCommit[]>;
    listCommit(pullRequestId: number, sha: string): Promise<PullRequestChanges>;
    listSince(
      pullRequestId: number,
      baselineSha: string,
      headSha: string,
    ): Promise<PullRequestChanges>;
    listRepositoryFiles(pullRequestId: number, headSha: string): Promise<RepositoryFiles>;
    getDiff(
      pullRequestId: number,
      headSha: string,
      mergeBase: string,
      path: string,
      previousPath: string | null,
    ): Promise<PullRequestFileDiff>;
  };
  pullRequestReviews: {
    listThreads(pullRequestId: number): Promise<ReviewThread[]>;
    replyToThread(reply: ReplyToThreadInput): Promise<ThreadActionResult>;
    setThreadResolved(change: SetThreadResolvedInput): Promise<ThreadActionResult>;
    submit(review: SubmitReviewInput): Promise<SubmitReviewResult>;
    getQueued(pullRequestId: number): Promise<QueuedReview | null>;
    merge(merge: MergePullRequestInput): Promise<MergePullRequestResult>;
    deleteBranch(branch: DeleteBranchInput): Promise<DeleteBranchResult>;
  };
  // Each call resolves with every draft of the pull request.
  reviewDrafts: {
    list(pullRequestId: number): Promise<ReviewDraft[]>;
    create(draft: CreateReviewDraftInput): Promise<ReviewDraft[]>;
    update(draft: UpdateReviewDraftInput): Promise<ReviewDraft[]>;
    reattach(move: ReattachReviewDraftsInput): Promise<ReviewDraft[]>;
    delete(pullRequestId: number, id: number): Promise<ReviewDraft[]>;
  };
  // Each call resolves with every finding of the pull request.
  reviewFindings: {
    list(pullRequestId: number): Promise<ReviewFinding[]>;
    create(finding: CreateReviewFindingInput): Promise<ReviewFinding[]>;
    update(finding: UpdateReviewFindingInput): Promise<ReviewFinding[]>;
    setResolution(change: SetFindingResolutionInput): Promise<ReviewFinding[]>;
    delete(pullRequestId: number, id: number): Promise<ReviewFinding[]>;
  };
  fileReviewMarks: {
    list(pullRequestId: number): Promise<FileReviewMark[]>;
    set(mark: SetFileReviewMarkInput): Promise<FileReviewMark[]>;
  };
  mergedPullRequests: {
    get(pullRequestId: number): Promise<MergedPullRequest | null>;
  };
  reviewCompletions: {
    get(pullRequestId: number): Promise<ReviewCompletion | null>;
    finish(pullRequestId: number): Promise<ReviewCompletion>;
  };
  repositorySearch: {
    search(input: RepositorySearchInput): Promise<RepositorySearchResult>;
  };
  reviewRounds: {
    sync(pullRequestId: number, headSha: string): Promise<ReviewRound[]>;
  };
  reviewSessions: {
    get(pullRequestId: number): Promise<ReviewSession | null>;
    save(session: SaveReviewSessionInput): Promise<ReviewSession>;
    getActive(): Promise<number | null>;
    // Null when no review is on show.
    setActive(pullRequestId: number | null): Promise<null>;
  };
  progression: {
    get(): Promise<Progression>;
    setActiveCharacter(characterId: CharacterId): Promise<Progression>;
    setOutfit(characterId: CharacterId, outfitId: OutfitId): Promise<Progression>;
    setWeapon(characterId: CharacterId, weaponId: WeaponId): Promise<Progression>;
    addReviewTime(pullRequestId: number, ms: number): Promise<null>;
    getStats(): Promise<ProgressStats>;
    listXp(pullRequestId: number): Promise<XpTransaction[]>;
  };
  achievements: {
    list(): Promise<Achievement[]>;
  };
  agentTasks: {
    list(): Promise<AgentTask[]>;
    listActivity(taskId: number): Promise<AgentEvent[]>;
    stop(taskId: number): Promise<null>;
    forceStop(taskId: number): Promise<null>;
    resume(taskId: number): Promise<null>;
    push(taskId: number): Promise<null>;
    changes(taskId: number): Promise<AgentChange[]>;
    investigate(taskId: number): Promise<null>;
    // false when the agent was no longer waiting for this answer.
    answer(answer: AnswerAgentQuestionInput): Promise<boolean>;
  };
}
