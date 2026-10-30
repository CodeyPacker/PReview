import { app } from 'electron';
import { pathToFileURL } from 'node:url';
import { devServerUrl, rendererIndexPath } from '../paths.ts';

// True only for the app's own renderer page: the dev server in development,
// the bundled index.html in production.
export function isTrustedRendererUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const devUrl = devServerUrl(app.isPackaged);
  if (devUrl) return parsed.origin === new URL(devUrl).origin;

  return (
    parsed.protocol === 'file:' && parsed.pathname === pathToFileURL(rendererIndexPath).pathname
  );
}
