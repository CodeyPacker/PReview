import { app } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import type { AppInfo } from '../../shared/contracts/ipc.ts';
import type { GitHubAuth } from '../services/github/auth.ts';
import type { RepositoryDiscovery } from '../services/repositories/discovery.ts';
import {
  createReviewDraft,
  deleteReviewDraft,
  listReviewDrafts,
  updateReviewDraft,
} from '../services/pull-requests/drafts.ts';
import type { PullRequestFiles } from '../services/pull-requests/files.ts';
import type { PullRequestReviews } from '../services/pull-requests/reviews.ts';
import type { PullRequestSync } from '../services/pull-requests/sync.ts';
import { updateRepositorySettings } from '../services/repositories/registry.ts';
import {
  addWatchedFolder,
  listWatchedFolders,
  removeWatchedFolder,
  setWatchedFolderScanDepth,
} from '../services/repositories/watched-folders.ts';
import { getSettings, updateSettings } from '../services/settings.ts';
import { handle } from './handle.ts';

export interface IpcServices {
  github: GitHubAuth;
  discovery: RepositoryDiscovery;
  pullRequests: PullRequestSync;
  pullRequestFiles: PullRequestFiles;
  pullRequestReviews: PullRequestReviews;
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
  handle('github.cancel', () => github.cancel());
  handle('github.disconnect', () => github.disconnect());

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

  handle('pullRequests.list', () => pullRequests.getState());
  handle('pullRequests.refresh', () => {
    void pullRequests.refresh();
    return pullRequests.getState();
  });

  handle('pullRequestFiles.list', ({ pullRequestId }) => pullRequestFiles.list(pullRequestId));
  handle('pullRequestFiles.getDiff', ({ pullRequestId, headSha, mergeBase, path, previousPath }) =>
    pullRequestFiles.getDiff(pullRequestId, headSha, mergeBase, path, previousPath),
  );

  handle('pullRequestReviews.listThreads', ({ pullRequestId }) =>
    pullRequestReviews.listThreads(pullRequestId),
  );
  handle('pullRequestReviews.replyToThread', (reply) => pullRequestReviews.reply(reply));
  handle('pullRequestReviews.setThreadResolved', (change) =>
    pullRequestReviews.setThreadResolved(change),
  );
  handle('pullRequestReviews.submit', (review) => pullRequestReviews.submit(review));
  handle('pullRequestReviews.merge', (merge) => pullRequestReviews.merge(merge));
  handle('pullRequestReviews.deleteBranch', (branch) => pullRequestReviews.deleteBranch(branch));

  handle('reviewDrafts.list', ({ pullRequestId }) => listReviewDrafts(db, pullRequestId));
  handle('reviewDrafts.create', (draft) => createReviewDraft(db, draft));
  handle('reviewDrafts.update', (draft) => updateReviewDraft(db, draft));
  handle('reviewDrafts.delete', ({ pullRequestId, id }) =>
    deleteReviewDraft(db, pullRequestId, id),
  );
}
