import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Updates } from './updates.ts';

// Stands in for electron-updater. Tests emit its events.
class FakeSource extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  checkForUpdates = vi.fn(() => Promise.resolve(null));
  quitAndInstall = vi.fn();
}

let source: FakeSource;
let busy: boolean;
const prompt = vi.fn<(kind: 'restart' | 'download', version: string) => Promise<boolean>>();
const openUrl = vi.fn();
const log = { info: vi.fn(), warn: vi.fn() };
let updates: Updates | undefined;

function create(canInstall: boolean, enabled = true): Updates {
  updates = new Updates({
    source,
    enabled,
    canInstall,
    releaseUrl: (version) => `https://example.test/v${version}`,
    busy: () => busy,
    prompt,
    openUrl,
    log,
    checkMs: 10_000,
    busyRetryMs: 1000,
  });
  return updates;
}

beforeEach(() => {
  vi.useFakeTimers();
  source = new FakeSource();
  busy = false;
  prompt.mockReset();
  openUrl.mockReset();
});

afterEach(() => {
  updates?.stop();
  vi.useRealTimers();
});

describe('Updates', () => {
  it('checks at start and then on an interval', () => {
    create(true).start();
    expect(source.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(source.checkForUpdates).toHaveBeenCalledTimes(3);
  });

  it('never checks in a development build', async () => {
    const updates = create(true, false);
    updates.start();
    expect(await updates.check()).toEqual({ status: 'unsupported' });
    expect(source.checkForUpdates).not.toHaveBeenCalled();
  });

  it('downloads an update, then restarts when the user agrees', async () => {
    prompt.mockResolvedValue(true);
    const updates = create(true);
    expect(source.autoDownload).toBe(true);

    source.emit('update-available', { version: '1.2.0' });
    source.emit('download-progress', { percent: 40 });
    expect(updates.get()).toEqual({ status: 'downloading', version: '1.2.0', percent: 40 });

    source.emit('update-downloaded', { version: '1.2.0' });
    expect(updates.get()).toEqual({ status: 'ready', version: '1.2.0' });
    await vi.waitFor(() => expect(source.quitAndInstall).toHaveBeenCalledTimes(1));
    expect(prompt).toHaveBeenCalledWith('restart', '1.2.0');
  });

  it('waits for agents to finish before asking to restart', async () => {
    prompt.mockResolvedValue(true);
    busy = true;
    create(true);

    source.emit('update-downloaded', { version: '1.2.0' });
    vi.advanceTimersByTime(3000);
    expect(prompt).not.toHaveBeenCalled();

    busy = false;
    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => expect(source.quitAndInstall).toHaveBeenCalledTimes(1));
  });

  it('refuses to restart while an agent runs, or before an update is ready', () => {
    const updates = create(true);
    expect(updates.install()).toEqual({ status: 'not-ready' });

    busy = true;
    source.emit('update-downloaded', { version: '1.2.0' });
    expect(updates.install()).toEqual({ status: 'busy' });
    busy = false;
    expect(updates.install()).toEqual({ status: 'restarting' });
    expect(source.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('asks once per version, and a declined update stays ready', async () => {
    prompt.mockResolvedValue(false);
    const updates = create(true);

    source.emit('update-downloaded', { version: '1.2.0' });
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    source.emit('update-downloaded', { version: '1.2.0' });
    await Promise.resolve();

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(source.quitAndInstall).not.toHaveBeenCalled();
    expect(updates.get()).toEqual({ status: 'ready', version: '1.2.0' });
  });

  it('sends the user to download an update it cannot install', async () => {
    prompt.mockResolvedValue(true);
    const updates = create(false);
    expect(source.autoDownload).toBe(false);
    expect(source.autoInstallOnAppQuit).toBe(false);

    source.emit('update-available', { version: '1.2.0' });
    expect(updates.get()).toEqual({
      status: 'available',
      version: '1.2.0',
      url: 'https://example.test/v1.2.0',
    });
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://example.test/v1.2.0'));
    expect(prompt).toHaveBeenCalledWith('download', '1.2.0');
  });

  it('reports a failed check, and leaves a ready update alone', async () => {
    source.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    const updates = create(true);
    expect(await updates.check()).toEqual({ status: 'error', message: 'offline' });

    source.emit('update-not-available');
    expect(updates.get()).toEqual({ status: 'idle' });

    prompt.mockResolvedValue(false);
    source.emit('update-downloaded', { version: '1.2.0' });
    expect(await updates.check()).toEqual({ status: 'ready', version: '1.2.0' });
    expect(source.checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
