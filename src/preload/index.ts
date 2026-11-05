import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel, IpcInput, IpcOutput } from '../shared/contracts/ipc.ts';
import type { PreviewApi } from '../shared/contracts/preload.ts';

function invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>> {
  return ipcRenderer.invoke(channel, input) as Promise<IpcOutput<C>>;
}

const api: PreviewApi = {
  app: {
    getInfo: () => invoke('app.getInfo', undefined),
  },
  settings: {
    getAll: () => invoke('settings.getAll', undefined),
    update: (patch) => invoke('settings.update', patch),
  },
  github: {
    getAuth: () => invoke('github.getAuth', undefined),
    connect: () => invoke('github.connect', undefined),
    connectWithCli: () => invoke('github.connectWithCli', undefined),
    cancel: () => invoke('github.cancel', undefined),
    disconnect: (login) => invoke('github.disconnect', { login }),
  },
  backups: {
    export: () => invoke('backups.export', undefined),
    restore: () => invoke('backups.restore', undefined),
  },
  notifications: {
    list: () => invoke('notifications.list', undefined),
    markAllRead: () => invoke('notifications.markAllRead', undefined),
    setQuiet: (quiet) => invoke('notifications.setQuiet', { quiet }),
  },
  updates: {
    get: () => invoke('updates.get', undefined),
    check: () => invoke('updates.check', undefined),
    install: () => invoke('updates.install', undefined),
  },
  folders: {
    list: () => invoke('folders.list', undefined),
    add: () => invoke('folders.add', undefined),
    setScanDepth: (id, scanDepth) => invoke('folders.setScanDepth', { id, scanDepth }),
    remove: (id) => invoke('folders.remove', { id }),
  },
  repositories: {
    list: () => invoke('repositories.list', undefined),
    scan: () => invoke('repositories.scan', undefined),
    updateSettings: (id, patch) => invoke('repositories.updateSettings', { id, patch }),
    setAccount: (id, login) => invoke('repositories.setAccount', { id, login }),
  },
  pullRequests: {
    list: () => invoke('pullRequests.list', undefined),
    refresh: () => invoke('pullRequests.refresh', undefined),
  },
  pullRequestReviews: {
    listThreads: (pullRequestId) => invoke('pullRequestReviews.listThreads', { pullRequestId }),
    replyToThread: (reply) => invoke('pullRequestReviews.replyToThread', reply),
    setThreadResolved: (change) => invoke('pullRequestReviews.setThreadResolved', change),
    submit: (review) => invoke('pullRequestReviews.submit', review),
    getQueued: (pullRequestId) => invoke('pullRequestReviews.getQueued', { pullRequestId }),
    merge: (merge) => invoke('pullRequestReviews.merge', merge),
    deleteBranch: (branch) => invoke('pullRequestReviews.deleteBranch', branch),
    close: (close) => invoke('pullRequestReviews.close', close),
  },
  pullRequestFiles: {
    list: (pullRequestId) => invoke('pullRequestFiles.list', { pullRequestId }),
    listCommits: (pullRequestId) => invoke('pullRequestFiles.listCommits', { pullRequestId }),
    listCommit: (pullRequestId, sha) =>
      invoke('pullRequestFiles.listCommit', { pullRequestId, sha }),
    listSince: (pullRequestId, baselineSha, headSha) =>
      invoke('pullRequestFiles.listSince', { pullRequestId, baselineSha, headSha }),
    listRepositoryFiles: (pullRequestId, headSha) =>
      invoke('pullRequestFiles.listRepositoryFiles', { pullRequestId, headSha }),
    getDiff: (pullRequestId, headSha, mergeBase, path, previousPath) =>
      invoke('pullRequestFiles.getDiff', { pullRequestId, headSha, mergeBase, path, previousPath }),
  },
  reviewDrafts: {
    list: (pullRequestId) => invoke('reviewDrafts.list', { pullRequestId }),
    create: (draft) => invoke('reviewDrafts.create', draft),
    update: (draft) => invoke('reviewDrafts.update', draft),
    reattach: (move) => invoke('reviewDrafts.reattach', move),
    delete: (pullRequestId, id) => invoke('reviewDrafts.delete', { pullRequestId, id }),
  },
  reviewFindings: {
    list: (pullRequestId) => invoke('reviewFindings.list', { pullRequestId }),
    screenshot: (id) => invoke('reviewFindings.screenshot', { id }),
    create: (finding) => invoke('reviewFindings.create', finding),
    update: (finding) => invoke('reviewFindings.update', finding),
    setResolution: (change) => invoke('reviewFindings.setResolution', change),
    delete: (pullRequestId, id) => invoke('reviewFindings.delete', { pullRequestId, id }),
  },
  fileReviewMarks: {
    list: (pullRequestId) => invoke('fileReviewMarks.list', { pullRequestId }),
    set: (mark) => invoke('fileReviewMarks.set', mark),
  },
  repositorySearch: {
    search: (input) => invoke('repositorySearch.search', input),
  },
  reviewRounds: {
    sync: (pullRequestId, headSha) => invoke('reviewRounds.sync', { pullRequestId, headSha }),
  },
  mergedPullRequests: {
    get: (pullRequestId) => invoke('mergedPullRequests.get', { pullRequestId }),
  },
  reviewCompletions: {
    get: (pullRequestId) => invoke('reviewCompletions.get', { pullRequestId }),
    finish: (pullRequestId) => invoke('reviewCompletions.finish', { pullRequestId }),
  },
  reviewSessions: {
    get: (pullRequestId) => invoke('reviewSessions.get', { pullRequestId }),
    save: (session) => invoke('reviewSessions.save', session),
    getActive: () => invoke('reviewSessions.getActive', undefined),
    setActive: (pullRequestId) => invoke('reviewSessions.setActive', { pullRequestId }),
  },
  progression: {
    get: () => invoke('progression.get', undefined),
    setActiveCharacter: (characterId) => invoke('progression.setActiveCharacter', { characterId }),
    setOutfit: (characterId, outfitId) =>
      invoke('progression.setOutfit', { characterId, outfitId }),
    setWeapon: (characterId, weaponId) =>
      invoke('progression.setWeapon', { characterId, weaponId }),
    addReviewTime: (pullRequestId, ms) =>
      invoke('progression.addReviewTime', { pullRequestId, ms }),
    getStats: () => invoke('progression.getStats', undefined),
    listXp: (pullRequestId) => invoke('progression.listXp', { pullRequestId }),
  },
  achievements: {
    list: () => invoke('achievements.list', undefined),
  },
  agentTasks: {
    list: () => invoke('agentTasks.list', undefined),
    listActivity: (taskId) => invoke('agentTasks.listActivity', { taskId }),
    stop: (taskId) => invoke('agentTasks.stop', { taskId }),
    forceStop: (taskId) => invoke('agentTasks.forceStop', { taskId }),
    resume: (taskId) => invoke('agentTasks.resume', { taskId }),
    push: (taskId) => invoke('agentTasks.push', { taskId }),
    changes: (taskId) => invoke('agentTasks.changes', { taskId }),
    investigate: (taskId) => invoke('agentTasks.investigate', { taskId }),
    answer: (answer) => invoke('agentTasks.answer', answer),
  },
};

contextBridge.exposeInMainWorld('preview', api);
