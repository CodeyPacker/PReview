import { join } from 'node:path';

// Build output locations, relative to out/main where the bundled main process runs.
export const preloadPath = join(import.meta.dirname, '../preload/index.cjs');
export const rendererIndexPath = join(import.meta.dirname, '../renderer/index.html');

// The Vite dev server URL. Only honored in development, so a packaged app can never be
// pointed at another page through the environment.
export function devServerUrl(isPackaged: boolean): string | undefined {
  return isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
}
