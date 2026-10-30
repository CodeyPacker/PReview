import { app } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import type { AppInfo } from '../../shared/contracts/ipc.ts';
import type { GitHubAuth } from '../services/github/auth.ts';
import { getSettings, updateSettings } from '../services/settings.ts';
import { handle } from './handle.ts';

export function registerIpcHandlers(db: DatabaseSync, github: GitHubAuth): void {
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
}
