import type { GitHubAuthState } from './github.ts';
import type { AppInfo } from './ipc.ts';
import type { RepositoriesState, RepositorySettingsPatch, WatchedFolder } from './repositories.ts';
import type { Settings, SettingsPatch } from './settings.ts';

// The API the preload script exposes to the renderer as `window.preview`.
// One function per IPC channel. Never expose ipcRenderer or Node APIs.
export interface PreviewApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  settings: {
    getAll(): Promise<Settings>;
    update(patch: SettingsPatch): Promise<Settings>;
  };
  github: {
    getAuth(): Promise<GitHubAuthState>;
    // Opens GitHub's device page and copies the code. Resolves once the code is ready.
    connect(): Promise<GitHubAuthState>;
    cancel(): Promise<GitHubAuthState>;
    disconnect(): Promise<GitHubAuthState>;
  };
  folders: {
    list(): Promise<WatchedFolder[]>;
    // Opens the native folder picker and watches the chosen folder.
    add(): Promise<WatchedFolder[]>;
    setScanDepth(id: number, scanDepth: number): Promise<WatchedFolder[]>;
    remove(id: number): Promise<WatchedFolder[]>;
  };
  repositories: {
    list(): Promise<RepositoriesState>;
    // Starts a scan of the watched folders. Resolves without waiting for it to finish.
    scan(): Promise<RepositoriesState>;
    updateSettings(id: number, patch: RepositorySettingsPatch): Promise<RepositoriesState>;
  };
}
