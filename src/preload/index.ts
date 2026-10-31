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
    cancel: () => invoke('github.cancel', undefined),
    disconnect: () => invoke('github.disconnect', undefined),
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
  },
  pullRequests: {
    list: () => invoke('pullRequests.list', undefined),
    refresh: () => invoke('pullRequests.refresh', undefined),
  },
};

contextBridge.exposeInMainWorld('preview', api);
