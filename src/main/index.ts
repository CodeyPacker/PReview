import { app, BrowserWindow, clipboard, dialog, Notification, safeStorage, shell } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { checkIntegrity, openDatabase } from './database/connection.ts';
import { ClaudeAgent } from './agents/claude/agent.ts';
import { AgentPublisher } from './services/agents/publisher.ts';
import { AgentRunner } from './services/agents/runner.ts';
import { AgentWorktrees } from './services/agents/worktrees.ts';
import { migrate } from './database/migrate.ts';
import { registerIpcHandlers } from './ipc/index.ts';
import { initLogging, log } from './logging/log.ts';
import { GitHubAccounts } from './services/github/accounts.ts';
import {
  createCredentialDirectory,
  moveLegacyCredentials,
  type Encryptor,
} from './services/github/credential-store.ts';
import { readGhToken } from './services/github/gh-cli.ts';
import { clearAccountRepositories } from './services/github/repository-accounts.ts';
import { GitHubClient } from './providers/github/client.ts';
import { GitHubProvider } from './providers/github/provider.ts';
import { RoutingProvider } from './providers/routing.ts';
import { PullRequestFiles } from './services/pull-requests/files.ts';
import { RepositorySearch } from './services/pull-requests/repository-search.ts';
import { PullRequestReviews } from './services/pull-requests/reviews.ts';
import { PullRequestSync } from './services/pull-requests/sync.ts';
import { RepositoryDiscovery } from './services/repositories/discovery.ts';
import { getSettings } from './services/settings.ts';
import { DatabaseBackups, newestValidBackup, restoreBackup } from './services/backups.ts';
import { validateReport } from './services/progression/xp.ts';
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

  // A page that crashes or is killed reloads by itself. A second crash within a minute asks
  // first, so a page that crashes as it loads can't loop.
  let lastCrash = 0;
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    log.error('The window crashed', details);
    const now = Date.now();
    const again = now - lastCrash < 60_000;
    lastCrash = now;
    if (again) {
      const response = dialog.showMessageBoxSync(win, {
        type: 'error',
        message: 'PReview keeps crashing',
        detail: 'The window crashed twice in a minute. Your saved review work is kept.',
        buttons: ['Reload', 'Quit'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response !== 0) {
        app.quit();
        return;
      }
    }
    win.webContents.reload();
  });

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

// Loads every connected account. Credentials saved before multiple accounts move into the
// per-account folder first.
async function createGitHubAccounts(): Promise<GitHubAccounts> {
  const dir = join(app.getPath('userData'), 'github-credentials');
  try {
    await moveLegacyCredentials(dir, encryptor);
  } catch (error) {
    log.warn('Could not move the stored GitHub credentials', error);
  }
  return GitHubAccounts.restore({
    directory: createCredentialDirectory(dir, encryptor),
    fetch,
    ghToken: readGhToken,
    sleep: (ms, signal) => sleep(ms, undefined, { signal }),
    openUrl: (url) => {
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
    },
    copyText: (text) => void clipboard.writeText(text),
    log,
  });
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

const backupDirectory = () => join(app.getPath('userData'), 'backups');

function openAppDatabase(path: string): DatabaseSync {
  const db = openDatabase(path);
  try {
    checkIntegrity(db);
    const version = migrate(db);
    log.info(`Database ready at schema version ${version}`, path);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// Opens the database. When it can't be opened, offers to put back the newest valid snapshot.
// Returns undefined when the user quits or nothing could be opened.
function openOrRestoreDatabase(): DatabaseSync | undefined {
  const path = join(app.getPath('userData'), 'preview.db');
  let failure: unknown;
  try {
    return openAppDatabase(path);
  } catch (error) {
    log.error('Could not open the database', error);
    failure = error;
  }
  const message = failure instanceof Error ? failure.message : String(failure);
  const backup = newestValidBackup(backupDirectory());
  if (backup) {
    const response = dialog.showMessageBoxSync({
      type: 'error',
      title: 'PReview could not open its database',
      message: 'PReview could not open its database',
      detail: `${message}\n\nRestore the backup from ${backup.createdAt.toLocaleString()}? Changes made since then are lost. The current database is kept next to it.`,
      buttons: ['Restore Backup', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return undefined;
    try {
      const aside = restoreBackup(backup, path);
      log.warn('Restored the database from a backup', { backup: backup.path, damaged: aside });
      return openAppDatabase(path);
    } catch (error) {
      log.error('Could not restore the database', error);
      dialog.showErrorBox(
        'PReview could not restore its database',
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }
  dialog.showErrorBox('PReview could not open its database', message);
  return undefined;
}

void app.whenReady().then(async () => {
  // Windows and Linux take the icon from the window. macOS shows the app's own icon in the
  // Dock, which is Electron's until the app is packaged.
  if (hiddenForTests) app.dock?.hide();
  else app.dock?.setIcon(icon);
  const db = openOrRestoreDatabase();
  if (!db) {
    app.exit(1);
    return;
  }

  const backups = new DatabaseBackups({ db, directory: backupDirectory(), log });
  backups.start();

  const discovery = new RepositoryDiscovery({ db, git: runGit, log });
  const github = await createGitHubAccounts();
  // Each call goes out with the account assigned to its repository.
  const provider = new RoutingProvider({
    db,
    logins: () => github.list().map((account) => account.login),
    createProvider: (login) =>
      new GitHubProvider(
        new GitHubClient({
          fetch,
          getToken: () => github.get(login)?.getToken() ?? Promise.resolve(undefined),
        }),
      ),
  });
  const pullRequests = new PullRequestSync({ db, provider, log });
  github.listen({
    // A new account may be the one that can read repositories still unassigned.
    added: () => void pullRequests.refresh(),
    // Its repositories go to a remaining account on the next sync.
    removed: (login) => clearAccountRepositories(db, login),
  });
  void github.verify();
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
    agent: new ClaudeAgent(app.isPackaged, () => getSettings(db).wslDistro),
    worktrees,
    notify,
    log,
    onCompleted: (taskId, report) => {
      try {
        validateReport(db, taskId, report);
      } catch (error) {
        log.warn('Could not validate findings', error);
      }
      void agentPublisher
        .afterRun(taskId, report)
        .catch((error: unknown) => log.warn('Could not push agent changes', error));
    },
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
    backups.stop();
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
