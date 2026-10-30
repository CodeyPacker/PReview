import { app, BrowserWindow, clipboard, dialog, safeStorage, shell } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { openDatabase } from './database/connection.ts';
import { migrate } from './database/migrate.ts';
import { registerIpcHandlers } from './ipc/index.ts';
import { initLogging, log } from './logging/log.ts';
import { GitHubAuth } from './services/github/auth.ts';
import { createCredentialStore } from './services/github/credential-store.ts';
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

function createGitHubAuth(): GitHubAuth {
  const auth = new GitHubAuth({
    store: createCredentialStore(join(app.getPath('userData'), 'github-credentials'), safeStorage),
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

function openAppDatabase(): DatabaseSync {
  const path = join(app.getPath('userData'), 'preview.db');
  const db = openDatabase(path);
  const version = migrate(db);
  log.info(`Database ready at schema version ${version}`, path);
  return db;
}

void app.whenReady().then(() => {
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

  registerIpcHandlers(db, createGitHubAuth());
  app.on('will-quit', () => db.close());

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
