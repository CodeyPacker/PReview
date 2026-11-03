import { app, BrowserWindow, clipboard, dialog, Notification, safeStorage, shell } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { runAgentSpike } from './agents/claude/spike.ts';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { openDatabase } from './database/connection.ts';
import { ClaudeAgent } from './agents/claude/agent.ts';
import { AgentPublisher } from './services/agents/publisher.ts';
import { AgentRunner } from './services/agents/runner.ts';
import { AgentWorktrees } from './services/agents/worktrees.ts';
import { migrate } from './database/migrate.ts';
import { registerIpcHandlers } from './ipc/index.ts';
import { initLogging, log } from './logging/log.ts';
import { GitHubAuth } from './services/github/auth.ts';
import { createCredentialStore, type Encryptor } from './services/github/credential-store.ts';
import { readGhToken } from './services/github/gh-cli.ts';
import { GitHubClient } from './providers/github/client.ts';
import { GitHubProvider } from './providers/github/provider.ts';
import { PullRequestFiles } from './services/pull-requests/files.ts';
import { RepositorySearch } from './services/pull-requests/repository-search.ts';
import { PullRequestReviews } from './services/pull-requests/reviews.ts';
import { PullRequestSync } from './services/pull-requests/sync.ts';
import { RepositoryDiscovery } from './services/repositories/discovery.ts';
import { runGitGrep } from './services/repositories/git-grep.ts';
import { createGit, runGit } from './services/repositories/git-info.ts';
import icon from '../../build/icon.png?asset';
import { devServerUrl, preloadPath, rendererIndexPath } from './paths.ts';

initLogging();

function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

// The end-to-end tests set this so their windows stay hidden. Playwright still drives them.
const hiddenForTests = process.env.PREVIEW_HIDE_WINDOW === '1';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    icon,
    // macOS: no title bar; the window buttons sit inside the sidebar's top-left corner.
    ...(process.platform === 'darwin' && {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 20, y: 14 },
    }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A hidden window would otherwise be throttled like a background tab.
      backgroundThrottling: !hiddenForTests,
    },
  });

  if (!hiddenForTests) win.once('ready-to-show', () => win.show());

  // Links that try to open a window go to the system browser, https only.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The app never navigates its own window away from the bundled page.
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = devServerUrl(app.isPackaged);
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(rendererIndexPath);
  }
}

// Adapts safeStorage's async API to the store's Encryptor.
const encryptor: Encryptor = {
  isEncryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encryptString: (text) => safeStorage.encryptStringAsync(text),
  decryptString: async (encrypted) => {
    let decrypted = await safeStorage.decryptStringAsync(encrypted);
    // A rotated key changes the plain text the first call returns, so ask again.
    if (decrypted.shouldReEncrypt) decrypted = await safeStorage.decryptStringAsync(encrypted);
    return decrypted.result;
  },
};

async function createGitHubAuth(): Promise<GitHubAuth> {
  const auth = await GitHubAuth.restore({
    store: createCredentialStore(join(app.getPath('userData'), 'github-credentials'), encryptor),
    fetch,
    ghToken: readGhToken,
    sleep: (ms, signal) => sleep(ms, undefined, { signal }),
    openUrl: (url) => {
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
    },
    copyText: (text) => void clipboard.writeText(text),
    log,
  });
  void auth.verify();
  return auth;
}

// Resolves to the real path, so a symlinked folder is watched once.
async function pickFolder(): Promise<string | undefined> {
  const options = {
    title: 'Add Watched Folder',
    properties: ['openDirectory' as const],
  };
  const window = BrowserWindow.getFocusedWindow();
  const result = await (window
    ? dialog.showOpenDialog(window, options)
    : dialog.showOpenDialog(options));
  const [picked] = result.filePaths;
  return result.canceled || !picked ? undefined : realpath(picked);
}

function openAppDatabase(): DatabaseSync {
  const path = join(app.getPath('userData'), 'preview.db');
  const db = openDatabase(path);
  const version = migrate(db);
  log.info(`Database ready at schema version ${version}`, path);
  return db;
}

void app.whenReady().then(async () => {
  // TEMPORARY: runs the agent sandbox check instead of the app, then quits.
  if (process.env.PREVIEW_AGENT_SPIKE === '1') {
    const passed = await runAgentSpike({
      isPackaged: app.isPackaged,
      userData: app.getPath('userData'),
      log,
    });
    app.exit(passed ? 0 : 1);
    return;
  }
  // Windows and Linux take the icon from the window. macOS shows the app's own icon in the
  // Dock, which is Electron's until the app is packaged.
  if (hiddenForTests) app.dock?.hide();
  else app.dock?.setIcon(icon);
  let db: DatabaseSync;
  try {
    db = openAppDatabase();
  } catch (error) {
    log.error('Could not open the database', error);
    dialog.showErrorBox(
      'PReview could not open its database',
      error instanceof Error ? error.message : String(error),
    );
    app.exit(1);
    return;
  }

  const discovery = new RepositoryDiscovery({ db, git: runGit, log });
  const github = await createGitHubAuth();
  const provider = new GitHubProvider(
    new GitHubClient({ fetch, getToken: () => github.getToken() }),
  );
  const pullRequests = new PullRequestSync({ db, provider, log });
  const pullRequestFiles = new PullRequestFiles({ db, provider });
  const pullRequestReviews = new PullRequestReviews({ db, provider });
  const repositorySearch = new RepositorySearch({ db, provider, git: runGit, grep: runGitGrep });
  // Fetching a pull request's branch can take a while on a large repository.
  const worktrees = new AgentWorktrees({
    db,
    git: createGit(120_000),
    root: join(app.getPath('userData'), 'worktrees'),
  });
  const notify = (title: string, body: string) => new Notification({ title, body }).show();
  const agentPublisher = new AgentPublisher({ db, provider, worktrees, notify, log });
  const agentRunner = new AgentRunner({
    db,
    provider,
    agent: new ClaudeAgent(app.isPackaged),
    worktrees,
    notify,
    log,
    onCompleted: (taskId, report) =>
      void agentPublisher
        .afterRun(taskId, report)
        .catch((error: unknown) => log.warn('Could not push agent changes', error)),
  });
  registerIpcHandlers(db, {
    github,
    discovery,
    pullRequests,
    pullRequestFiles,
    pullRequestReviews,
    repositorySearch,
    agentRunner,
    agentPublisher,
    pickFolder,
  });
  void discovery.scan();
  pullRequests.start();
  agentRunner.recover();
  agentRunner.wake();
  agentPublisher.start();
  void pullRequestReviews
    .recoverSubmissions()
    // A review confirmed now may have queued an agent task.
    .then(() => agentRunner.wake())
    .catch((error: unknown) => log.warn('Could not check unconfirmed reviews', error));
  void worktrees
    .cleanUp()
    .then((kept) => {
      if (kept.length > 0) log.info('Kept agent worktrees with unsaved changes', kept);
    })
    .catch((error: unknown) => log.warn('Could not clean up agent worktrees', error));

  app.on('will-quit', () => {
    agentRunner.shutdown();
    agentPublisher.stop();
    pullRequests.stop();
    db.close();
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
