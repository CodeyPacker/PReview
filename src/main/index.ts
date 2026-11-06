import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  net,
  Notification,
  powerMonitor,
  safeStorage,
  shell,
  Tray,
} from 'electron';
// electron-updater is CommonJS, so its named exports come off the default one.
import electronUpdater from 'electron-updater';
import type { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
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
import { FolderWatcher } from './services/repositories/folder-watcher.ts';
import { getSettings } from './services/settings.ts';
import { ConnectivityWatch } from './services/connectivity.ts';
import { Notifier } from './services/notifications.ts';
import { Updates } from './services/updates.ts';
import { shellPath } from './services/shell-path.ts';
import { WindowLifetime } from './services/window-lifetime.ts';
import { onAchievementsUnlocked } from './services/progression/achievements.ts';
import {
  applyStagedRestore,
  DatabaseBackups,
  newestValidBackup,
  restoreBackup,
  stagedRestorePath,
  stageRestore,
} from './services/backups.ts';
import { migrations } from './database/migrations.ts';
import type { ExportBackupResult, RestoreBackupResult } from '../shared/contracts/backups.ts';
import { validateReport } from './services/progression/xp.ts';
import { runGitGrep } from './services/repositories/git-grep.ts';
import { createGit, runGit } from './services/repositories/git-info.ts';
import icon from '../../build/icon.png?asset';
import { devServerUrl, preloadPath, rendererIndexPath } from './paths.ts';

initLogging();

// The window hides to the tray on close, so opening PReview again must reach the running copy.
// Two copies would also share one database.
if (!app.requestSingleInstanceLock()) app.exit(0);

function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

// The end-to-end tests set this so their windows stay hidden. Playwright still drives them.
const hiddenForTests = process.env.PREVIEW_HIDE_WINDOW === '1';

function createWindow(lifetime: WindowLifetime): void {
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

  // Closing hides the window, so running agents continue. Quitting is what ends the app.
  win.on('close', (event) => {
    if (!lifetime.hideOnClose) return;
    event.preventDefault();
    win.hide();
  });
  // Windows is shutting down or signing out, and a hidden window must not hold that up.
  win.on('session-end', () => lifetime.forceQuit());

  // Links that try to open a window go to the system browser, https only.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The app uses no browser permissions, such as the camera or location, except writing to the
  // clipboard when code is copied.
  const allowed = (permission: string) => permission === 'clipboard-sanitized-write';
  win.webContents.session.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(allowed(permission)),
  );
  win.webContents.session.setPermissionCheckHandler((_contents, permission) => allowed(permission));

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
      const box = {
        type: 'error' as const,
        message: 'PReview keeps crashing',
        detail: 'The window crashed twice in a minute. Your saved review work is kept.',
        buttons: ['Reload', 'Quit'],
        defaultId: 0,
        cancelId: 1,
      };
      // A box attached to a hidden window would never be seen.
      const response = win.isVisible()
        ? dialog.showMessageBoxSync(win, box)
        : dialog.showMessageBoxSync(box);
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

// Brings PReview forward without changing the screen.
function showWindow(lifetime: WindowLifetime): void {
  const [window] = BrowserWindow.getAllWindows();
  if (!window) return createWindow(lifetime);
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

// Kept here so the tray icon isn't garbage collected.
let tray: Tray | undefined;

function createTray(lifetime: WindowLifetime): void {
  const source = nativeImage.createFromPath(icon);
  const image = source.resize({ width: 16, height: 16, quality: 'best' });
  image.addRepresentation({
    scaleFactor: 2,
    buffer: source.resize({ width: 32, height: 32, quality: 'best' }).toPNG(),
  });
  tray = new Tray(image);
  tray.setToolTip('PReview');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open PReview', click: () => showWindow(lifetime) },
      { type: 'separator' },
      { label: 'Quit PReview', click: () => app.quit() },
    ]),
  );
  // On Windows a click opens the window, and a right click the menu. On macOS a click opens the
  // menu, and this doesn't fire.
  tray.on('click', () => showWindow(lifetime));
}

const backupDirectory = () => join(app.getPath('userData'), 'backups');
const databasePath = () => join(app.getPath('userData'), 'preview.db');

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
  const path = databasePath();
  // A backup the user chose to restore goes in place before the database opens.
  try {
    const replaced = applyStagedRestore(path);
    if (replaced) log.warn('Restored the database from a chosen backup', { replaced });
  } catch (error) {
    log.error('Could not restore the chosen backup', error);
  }
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
      const aside = restoreBackup(backup.path, path, 'broken');
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
  // Opened from Finder, the app lacks the terminal's PATH and wouldn't find gh.
  if (app.isPackaged && process.platform === 'darwin') process.env.PATH = await shellPath();
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
  const backupFiles = {
    async export(): Promise<ExportBackupResult> {
      const day = new Date().toISOString().slice(0, 10);
      const options = {
        title: 'Export Backup',
        defaultPath: join(app.getPath('documents'), `PReview backup ${day}.db`),
        filters: [{ name: 'PReview backup', extensions: ['db'] }],
      };
      const window = BrowserWindow.getFocusedWindow();
      const result = await (window
        ? dialog.showSaveDialog(window, options)
        : dialog.showSaveDialog(options));
      if (result.canceled || !result.filePath) return { status: 'canceled' };
      backups.exportTo(result.filePath);
      log.info('Exported a backup', result.filePath);
      return { status: 'exported', path: result.filePath };
    },
    // Restarts PReview to put the chosen backup in place, so it resolves only when the user
    // cancels or the file can't be used.
    async restore(): Promise<RestoreBackupResult> {
      const options = {
        title: 'Restore Backup',
        defaultPath: backupDirectory(),
        filters: [{ name: 'PReview backup', extensions: ['db'] }],
        properties: ['openFile' as const],
      };
      const window = BrowserWindow.getFocusedWindow();
      const result = await (window
        ? dialog.showOpenDialog(window, options)
        : dialog.showOpenDialog(options));
      const [picked] = result.filePaths;
      if (result.canceled || !picked) return { status: 'canceled' };
      try {
        stageRestore(picked, databasePath(), migrations.at(-1)?.version ?? 0);
      } catch (error) {
        return {
          status: 'invalid',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      const confirm = {
        type: 'warning' as const,
        message: 'Restore this backup?',
        detail:
          'PReview restarts to restore it. Changes made since the backup are lost. The current database is kept next to it.',
        buttons: ['Restart and Restore', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      };
      const { response } = await (window
        ? dialog.showMessageBox(window, confirm)
        : dialog.showMessageBox(confirm));
      if (response !== 0) {
        rmSync(stagedRestorePath(databasePath()), { force: true });
        return { status: 'canceled' };
      }
      log.warn('Restarting to restore a backup', picked);
      lifetime.forceQuit();
      app.relaunch();
      app.quit();
      return new Promise(() => {});
    },
  };

  const folderWatcher = new FolderWatcher({ db, scan: () => void discovery.scan(), log });
  const discovery = new RepositoryDiscovery({
    db,
    git: runGit,
    log,
    afterScan: () => folderWatcher.sync(),
  });
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
  const lifetime = new WindowLifetime({
    busy: () => agentRunner.busy,
    confirmQuit: () =>
      dialog.showMessageBoxSync({
        type: 'warning',
        message: 'An agent is still running',
        detail: 'Quitting stops it. To let it finish, keep PReview running and close the window.',
        buttons: ['Keep Running', 'Quit Anyway'],
        defaultId: 0,
        cancelId: 0,
      }) === 1,
  });
  // A click on a desktop notification brings PReview forward without changing the screen.
  const notifier = new Notifier({
    db,
    show: (title, body) => {
      const notification = new Notification({ title, body });
      notification.on('click', () => {
        showWindow(lifetime);
      });
      notification.show();
    },
  });
  onAchievementsUnlocked((earned) => {
    for (const { name, description } of earned) {
      notifier.notify('achievement', `Achievement unlocked: ${name}`, description);
    }
  });
  const pullRequests = new PullRequestSync({
    db,
    provider,
    log,
    notify: (title, body) => notifier.notify('pull-request', title, body),
  });
  github.listen({
    // A new account may be the one that can read repositories still unassigned.
    added: () => void pullRequests.refresh(),
    // Its repositories go to a remaining account on the next sync.
    removed: (login) => clearAccountRepositories(db, login),
  });
  void github.verify();
  const pullRequestFiles = new PullRequestFiles({ db, provider });
  const pullRequestReviews = new PullRequestReviews({
    db,
    provider,
    notify: (title, body) => notifier.notify('review', title, body),
    log,
  });
  const notify = (title: string, body: string) => notifier.notify('agent', title, body);
  const repositorySearch = new RepositorySearch({ db, provider, git: runGit, grep: runGitGrep });
  // Fetching a pull request's branch can take a while on a large repository.
  const worktrees = new AgentWorktrees({
    db,
    git: createGit(120_000),
    root: join(app.getPath('userData'), 'worktrees'),
  });
  const agentPublisher = new AgentPublisher({ db, provider, worktrees, notify, log });
  const agentRunner = new AgentRunner({
    db,
    provider,
    agent: new ClaudeAgent(() => getSettings(db)),
    worktrees,
    notify,
    log,
    limit: () => getSettings(db).agentLimit,
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
  // Releases are published to GitHub, as electron-builder.yml says.
  const { autoUpdater } = electronUpdater;
  autoUpdater.logger = log;
  const updates = new Updates({
    source: autoUpdater,
    enabled: app.isPackaged,
    // An ad-hoc signed macOS app can't install an update, so the user downloads it.
    canInstall: process.platform !== 'darwin',
    releaseUrl: (version) => `https://github.com/CodeyPacker/PReview/releases/tag/v${version}`,
    busy: () => agentRunner.busy,
    prompt: async (kind, version) => {
      const options =
        kind === 'restart'
          ? {
              message: `PReview ${version} is ready`,
              detail: 'Restart now to install it, or it installs the next time PReview quits.',
              buttons: ['Restart Now', 'Later'],
            }
          : {
              message: `PReview ${version} is available`,
              detail: 'Download it from GitHub to replace this copy of PReview.',
              buttons: ['Download', 'Later'],
            };
      // A box attached to a window hidden in the tray would never be seen.
      const window = BrowserWindow.getAllWindows().find((item) => item.isVisible());
      const box = { type: 'info' as const, defaultId: 0, cancelId: 1, ...options };
      const { response } = await (window
        ? dialog.showMessageBox(window, box)
        : dialog.showMessageBox(box));
      return response === 0;
    },
    openUrl: (url) => void shell.openExternal(url),
    log,
  });
  registerIpcHandlers(db, {
    backupFiles,
    notifier,
    updates,
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
  // Reviews GitHub couldn't be reached for are sent at startup and then once a minute.
  const sendQueuedReviews = () =>
    void pullRequestReviews
      .sendQueued()
      // A review sent now may have queued an agent task.
      .then(() => agentRunner.wake())
      .catch((error: unknown) => log.warn('Could not send queued reviews', error));
  sendQueuedReviews();
  const queuedReviewsTimer = setInterval(sendQueuedReviews, 60_000);
  // A refresh skips the backoff after failed syncs, so the Inbox catches up right away.
  const connectivity = new ConnectivityWatch({
    isOnline: () => net.isOnline(),
    onReconnect: () => {
      log.info('Back online. Syncing now.');
      void pullRequests.refresh();
      sendQueuedReviews();
    },
  });
  connectivity.start();
  powerMonitor.on('resume', () => connectivity.resumed());
  void worktrees
    .cleanUp()
    .then((kept) => {
      if (kept.length > 0) log.info('Kept agent worktrees with unsaved changes', kept);
    })
    .catch((error: unknown) => log.warn('Could not clean up agent worktrees', error));

  app.on('will-quit', () => {
    folderWatcher.stop();
    agentRunner.shutdown();
    agentPublisher.stop();
    pullRequests.stop();
    backups.stop();
    clearInterval(queuedReviewsTimer);
    connectivity.stop();
    updates.stop();
    db.close();
  });

  app.on('before-quit', (event) => {
    if (!lifetime.requestQuit()) event.preventDefault();
  });
  app.on('second-instance', () => showWindow(lifetime));
  app.on('activate', () => showWindow(lifetime));

  createWindow(lifetime);
  createTray(lifetime);
  updates.start();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
