// The API the preload script exposes to the renderer as `window.preview`.
// Add narrow, typed functions here. Never expose ipcRenderer or Node APIs.
export type PreviewApi = Record<string, never>;
