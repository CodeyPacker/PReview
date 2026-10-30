import type { AppInfo } from './ipc.ts';
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
}
