import { contextBridge } from 'electron';
import type { PreviewApi } from '../shared/contracts/preload.ts';

const api: PreviewApi = {};

contextBridge.exposeInMainWorld('preview', api);
