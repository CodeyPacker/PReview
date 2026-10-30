import { app } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import type { AppInfo } from '../../shared/contracts/ipc.ts';
import type { GitHubAuth } from '../services/github/auth.ts';
import type { RepositoryDiscovery } from '../services/repositories/discovery.ts';
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
  // Asks the user for a folder. Resolves undefined when they cancel.
  pickFolder: () => Promise<string | undefined>;
}

export function registerIpcHandlers(
  db: DatabaseSync,
  { github, discovery, pickFolder }: IpcServices,
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
}
