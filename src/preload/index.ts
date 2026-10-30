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
};

contextBridge.exposeInMainWorld('preview', api);
