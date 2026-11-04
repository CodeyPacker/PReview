import { app } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import type { AppInfo } from '../../shared/contracts/ipc.ts';
import type { GitHubAccounts } from '../services/github/accounts.ts';
import type { RepositoryDiscovery } from '../services/repositories/discovery.ts';
import {
  createReviewDraft,
  deleteReviewDraft,
  listReviewDrafts,
  updateReviewDraft,
} from '../services/pull-requests/drafts.ts';
import {
  createReviewFinding,
  deleteReviewFinding,
  listReviewFindings,
  setReviewFindingResolution,
  updateReviewFinding,
} from '../services/pull-requests/findings.ts';
import { listFileReviewMarks, setFileReviewMark } from '../services/pull-requests/marks.ts';
import { getMergedPullRequest } from '../services/pull-requests/merged.ts';
import { finishReview, getReviewCompletion } from '../services/pull-requests/completions.ts';
import {
  getActiveReview,
  getReviewSession,
  saveReviewSession,
  setActiveReview,
} from '../services/pull-requests/sessions.ts';
import { syncReviewRounds } from '../services/pull-requests/rounds.ts';
import {
  addReviewTime,
  getProgression,
  listXpTransactions,
  setActiveCharacter,
  startReviewProgress,
} from '../services/progression/xp.ts';
import { listAchievements } from '../services/progression/achievements.ts';
import { getProgressStats } from '../services/progression/stats.ts';
import type { PullRequestFiles } from '../services/pull-requests/files.ts';
import type { PullRequestReviews } from '../services/pull-requests/reviews.ts';
import type { PullRequestSync } from '../services/pull-requests/sync.ts';
import {
  clearRepositoryAccount,
  setRepositoryAccount,
} from '../services/github/repository-accounts.ts';
import { listRepositories, updateRepositorySettings } from '../services/repositories/registry.ts';
import {
  addWatchedFolder,
  listWatchedFolders,
  removeWatchedFolder,
  setWatchedFolderScanDepth,
} from '../services/repositories/watched-folders.ts';
import { getSettings, updateSettings } from '../services/settings.ts';
import type { RepositorySearch } from '../services/pull-requests/repository-search.ts';
import { listActivity, listAgentTasks } from '../services/agents/activity.ts';
import type { AgentPublisher } from '../services/agents/publisher.ts';
import type { AgentRunner } from '../services/agents/runner.ts';
import { handle } from './handle.ts';

export interface IpcServices {
  github: GitHubAccounts;
  discovery: RepositoryDiscovery;
  pullRequests: PullRequestSync;
  pullRequestFiles: PullRequestFiles;
  pullRequestReviews: PullRequestReviews;
  repositorySearch: RepositorySearch;
  agentRunner: Pick<
    AgentRunner,
    'wake' | 'stop' | 'forceStop' | 'resume' | 'answer' | 'investigate'
  >;
  agentPublisher: Pick<AgentPublisher, 'push' | 'changes'>;
  // Asks the user for a folder. Resolves undefined when they cancel.
  pickFolder: () => Promise<string | undefined>;
}

export function registerIpcHandlers(
  db: DatabaseSync,
  {
    github,
    discovery,
    pullRequests,
    pullRequestFiles,
    pullRequestReviews,
    repositorySearch,
    agentRunner,
    agentPublisher,
    pickFolder,
  }: IpcServices,
): void {
  handle('app.getInfo', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform as AppInfo['platform'],
    electronVersion: process.versions.electron,
  }));

  handle('settings.getAll', () => getSettings(db));
  handle('settings.update', (patch) => updateSettings(db, patch));

  handle('github.getAuth', () => github.getState());
  handle('github.connect', () => github.connect());
  handle('github.connectWithCli', () => github.connectWithCli());
  handle('github.cancel', () => github.cancel());
  handle('github.disconnect', ({ login }) => github.disconnect(login));

  handle('folders.list', () => listWatchedFolders(db));
  handle('folders.add', async () => {
    const path = await pickFolder();
    if (path) {
      addWatchedFolder(db, path);
      void discovery.scan();
    }
    return listWatchedFolders(db);
  });
  handle('folders.setScanDepth', ({ id, scanDepth }) => {
    setWatchedFolderScanDepth(db, id, scanDepth);
    void discovery.scan();
    return listWatchedFolders(db);
  });
  handle('folders.remove', ({ id }) => {
    removeWatchedFolder(db, id);
    void discovery.scan();
    return listWatchedFolders(db);
  });

  handle('repositories.list', () => discovery.getState());
  handle('repositories.scan', () => {
    void discovery.scan();
    return discovery.getState();
  });
  handle('repositories.updateSettings', ({ id, patch }) => {
    updateRepositorySettings(db, id, patch);
    return discovery.getState();
  });
  // Saves the account for the repository's owner/name, then syncs, since another account may
  // see other pull requests. Stored pull requests are kept, so their drafts are too.
  handle('repositories.setAccount', ({ id, login }) => {
    const repository = listRepositories(db).find((candidate) => candidate.id === id);
    if (!repository?.github) throw new Error('This repository has no GitHub remote.');
    const fullName = `${repository.github.owner}/${repository.github.name}`;
    if (login === null) {
      clearRepositoryAccount(db, fullName);
    } else {
      const account = github.get(login);
      if (!account) throw new Error('That GitHub account is not connected.');
      setRepositoryAccount(db, fullName, account.login, true);
    }
    void pullRequests.refresh();
    return discovery.getState();
  });

  handle('pullRequests.list', () => pullRequests.getState());
  handle('pullRequests.refresh', () => {
    void pullRequests.refresh();
    return pullRequests.getState();
  });

  handle('pullRequestFiles.list', ({ pullRequestId }) => pullRequestFiles.list(pullRequestId));
  handle('pullRequestFiles.listCommits', ({ pullRequestId }) =>
    pullRequestFiles.listCommits(pullRequestId),
  );
  handle('pullRequestFiles.listCommit', ({ pullRequestId, sha }) =>
    pullRequestFiles.listCommit(pullRequestId, sha),
  );
  handle('pullRequestFiles.listSince', ({ pullRequestId, baselineSha, headSha }) =>
    pullRequestFiles.listSince(pullRequestId, baselineSha, headSha),
  );
  handle('pullRequestFiles.listRepositoryFiles', ({ pullRequestId, headSha }) =>
    pullRequestFiles.listRepositoryFiles(pullRequestId, headSha),
  );
  handle('pullRequestFiles.getDiff', ({ pullRequestId, headSha, mergeBase, path, previousPath }) =>
    pullRequestFiles.getDiff(pullRequestId, headSha, mergeBase, path, previousPath),
  );

  handle('repositorySearch.search', (input) => repositorySearch.search(input));
  handle('pullRequestReviews.listThreads', ({ pullRequestId }) =>
    pullRequestReviews.listThreads(pullRequestId),
  );
  handle('pullRequestReviews.replyToThread', (reply) => pullRequestReviews.reply(reply));
  handle('pullRequestReviews.setThreadResolved', (change) =>
    pullRequestReviews.setThreadResolved(change),
  );
  handle('pullRequestReviews.submit', async (review) => {
    const result = await pullRequestReviews.submit(review);
    if (review.sendToAgent && result.status === 'submitted') agentRunner.wake();
    return result;
  });
  handle('agentTasks.list', () => listAgentTasks(db));
  handle('agentTasks.listActivity', ({ taskId }) => listActivity(db, taskId));
  handle('agentTasks.stop', async ({ taskId }) => {
    await agentRunner.stop(taskId);
    return null;
  });
  handle('agentTasks.forceStop', ({ taskId }) => {
    agentRunner.forceStop(taskId);
    return null;
  });
  handle('agentTasks.resume', ({ taskId }) => {
    agentRunner.resume(taskId);
    return null;
  });
  handle('agentTasks.push', async ({ taskId }) => {
    await agentPublisher.push(taskId);
    return null;
  });
  handle('agentTasks.changes', ({ taskId }) => agentPublisher.changes(taskId));
  handle('agentTasks.investigate', ({ taskId }) => {
    agentRunner.investigate(taskId);
    return null;
  });
  handle('agentTasks.answer', ({ questionId, answers }) => agentRunner.answer(questionId, answers));
  handle('pullRequestReviews.merge', (merge) => pullRequestReviews.merge(merge));
  handle('pullRequestReviews.deleteBranch', (branch) => pullRequestReviews.deleteBranch(branch));

  handle('reviewDrafts.list', ({ pullRequestId }) => listReviewDrafts(db, pullRequestId));
  handle('reviewDrafts.create', (draft) => createReviewDraft(db, draft));
  handle('reviewDrafts.update', (draft) => updateReviewDraft(db, draft));
  handle('reviewDrafts.reattach', (move) => pullRequestReviews.reattachDrafts(move));
  handle('reviewDrafts.delete', ({ pullRequestId, id }) =>
    deleteReviewDraft(db, pullRequestId, id),
  );

  handle('reviewFindings.list', ({ pullRequestId }) => listReviewFindings(db, pullRequestId));
  handle('reviewFindings.create', (finding) => createReviewFinding(db, finding));
  handle('reviewFindings.update', (finding) => updateReviewFinding(db, finding));
  handle('reviewFindings.setResolution', (change) => setReviewFindingResolution(db, change));
  handle('reviewFindings.delete', ({ pullRequestId, id }) =>
    deleteReviewFinding(db, pullRequestId, id),
  );

  handle('fileReviewMarks.list', ({ pullRequestId }) => listFileReviewMarks(db, pullRequestId));
  handle('fileReviewMarks.set', (mark) => setFileReviewMark(db, mark));
  handle('reviewRounds.sync', ({ pullRequestId, headSha }) =>
    syncReviewRounds(db, pullRequestId, headSha),
  );
  handle('mergedPullRequests.get', ({ pullRequestId }) => getMergedPullRequest(db, pullRequestId));
  handle('reviewCompletions.get', ({ pullRequestId }) => getReviewCompletion(db, pullRequestId));
  handle('reviewCompletions.finish', ({ pullRequestId }) => finishReview(db, pullRequestId));
  handle('reviewSessions.get', ({ pullRequestId }) => getReviewSession(db, pullRequestId));
  handle('reviewSessions.save', (session) => saveReviewSession(db, session));
  handle('reviewSessions.getActive', () => getActiveReview(db));
  // Opening a review picks the character it earns XP for.
  handle('reviewSessions.setActive', ({ pullRequestId }) => {
    setActiveReview(db, pullRequestId);
    if (pullRequestId !== null) startReviewProgress(db, pullRequestId);
    return null;
  });
  handle('progression.get', () => getProgression(db));
  handle('progression.setActiveCharacter', ({ characterId }) =>
    setActiveCharacter(db, characterId),
  );
  handle('achievements.list', () => listAchievements(db));
  handle('progression.getStats', () => getProgressStats(db));
  handle('progression.listXp', ({ pullRequestId }) => listXpTransactions(db, pullRequestId));
  handle('progression.addReviewTime', ({ pullRequestId, ms }) => {
    addReviewTime(db, pullRequestId, ms);
    return null;
  });
}
