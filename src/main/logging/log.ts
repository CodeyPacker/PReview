import { app } from 'electron';
import log from 'electron-log/main';
import { redact } from './redact.ts';

// Main-process logging. Files go to the OS log folder (~/Library/Logs/<app> on macOS,
// %USERPROFILE%\AppData\Roaming\<app>\logs on Windows).
export function initLogging(): void {
  log.transports.file.level = 'info';
  log.transports.console.level = app.isPackaged ? false : 'debug';

  // Every message passes through redaction before any transport writes it.
  log.hooks.push((message) => ({ ...message, data: message.data.map((item) => redact(item)) }));

  log.errorHandler.startCatching({ showDialog: false });
}

export { log };
