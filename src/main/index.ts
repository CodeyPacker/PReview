import { app, BrowserWindow, clipboard, dialog, safeStorage, shell } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { openDatabase } from './database/connection.ts';
import { migrate } from './database/migrate.ts';
import { registerIpcHandlers } from './ipc/index.ts';
import { initLogging, log } from './logging/log.ts';
import { GitHubAuth } from './services/github/auth.ts';
import { createCredentialStore, type Encryptor } from './services/github/credential-store.ts';
import { GitHubClient } from './providers/github/client.ts';
import { GitHubProvider } from './providers/github/provider.ts';
import { PullRequestFiles } from './services/pull-requests/files.ts';
import { PullRequestSync } from './services/pull-requests/sync.ts';
import { RepositoryDiscovery } from './services/repositories/discovery.ts';
import { runGit } from './services/repositories/git-info.ts';
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
      trafficLightPosition: { x: 32, y: 34 },
    }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

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
  // Windows and Linux take the icon from the window. macOS shows the app's own icon in the
  // Dock, which is Electron's until the app is packaged.
  app.dock?.setIcon(icon);
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
  registerIpcHandlers(db, { github, discovery, pullRequests, pullRequestFiles, pickFolder });
  void discovery.scan();
  pullRequests.start();
  app.on('will-quit', () => {
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
