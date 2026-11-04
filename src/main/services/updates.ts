import type { InstallUpdateResult, UpdateState } from '../../shared/contracts/updates.ts';

// How often a running app checks for a new version.
const CHECK_MS = 4 * 60 * 60 * 1000;
// How often a downloaded update looks again for a moment with no agent running.
const BUSY_RETRY_MS = 60 * 1000;

// The parts of electron-updater's autoUpdater this uses.
export interface UpdateSource {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(
    event: 'update-available' | 'update-downloaded',
    listener: (info: { version: string }) => void,
  ): unknown;
  on(event: 'update-not-available', listener: () => void): unknown;
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdatesDeps {
  source: UpdateSource;
  // False in a development build, which never updates.
  enabled: boolean;
  // False where the update can't be installed by PReview, such as an unsigned macOS app. The
  // user is then sent to download it.
  canInstall: boolean;
  // The release page of a version.
  releaseUrl: (version: string) => string;
  // Whether an agent is running. PReview never restarts while one is.
  busy: () => boolean;
  // Asks the user once per version. Resolves true to restart now, or to open the download.
  prompt: (kind: 'restart' | 'download', version: string) => Promise<boolean>;
  openUrl: (url: string) => void;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void };
  checkMs?: number;
  busyRetryMs?: number;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Checks GitHub Releases for a new version at start and every few hours. Where it can install,
// it downloads the update and asks before restarting, never while an agent runs. A declined
// update installs when PReview quits.
export class Updates {
  private state: UpdateState = { status: 'idle' };
  private timer: ReturnType<typeof setInterval> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  // The versions the user was already asked about.
  private readonly asked = new Set<string>();

  constructor(private readonly deps: UpdatesDeps) {
    if (!deps.enabled) this.state = { status: 'unsupported' };
    const { source } = deps;
    source.autoDownload = deps.canInstall;
    source.autoInstallOnAppQuit = deps.canInstall;
    source.on('update-available', ({ version }) => {
      if (deps.canInstall) {
        this.state = { status: 'downloading', version, percent: 0 };
        return;
      }
      const url = deps.releaseUrl(version);
      this.state = { status: 'available', version, url };
      void this.ask('download', version).then((yes) => yes && deps.openUrl(url));
    });
    source.on('update-not-available', () => {
      this.state = { status: 'idle' };
    });
    source.on('download-progress', ({ percent }) => {
      if (this.state.status === 'downloading') this.state = { ...this.state, percent };
    });
    source.on('update-downloaded', ({ version }) => {
      this.state = { status: 'ready', version };
      this.offerRestart(version);
    });
    source.on('error', (error) => {
      deps.log.warn('Could not update', error);
      this.state = { status: 'error', message: messageOf(error) };
    });
  }

  get(): UpdateState {
    return this.state;
  }

  start(): void {
    if (!this.deps.enabled) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), this.deps.checkMs ?? CHECK_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    clearTimeout(this.retry);
  }

  // A download in progress or a downloaded update isn't checked over.
  async check(): Promise<UpdateState> {
    if (['unsupported', 'downloading', 'ready'].includes(this.state.status)) return this.state;
    this.state = { status: 'checking' };
    try {
      await this.deps.source.checkForUpdates();
    } catch (error) {
      this.deps.log.warn('Could not check for updates', error);
      this.state = { status: 'error', message: messageOf(error) };
    }
    return this.state;
  }

  install(): InstallUpdateResult {
    if (this.state.status !== 'ready') return { status: 'not-ready' };
    if (this.deps.busy()) return { status: 'busy' };
    this.deps.log.info('Restarting to install an update', this.state.version);
    this.deps.source.quitAndInstall();
    return { status: 'restarting' };
  }

  // Waits for no agent to be running, then asks once.
  private offerRestart(version: string): void {
    clearTimeout(this.retry);
    if (this.deps.busy()) {
      this.retry = setTimeout(
        () => this.offerRestart(version),
        this.deps.busyRetryMs ?? BUSY_RETRY_MS,
      );
      return;
    }
    void this.ask('restart', version).then((yes) => {
      if (yes) this.install();
    });
  }

  private async ask(kind: 'restart' | 'download', version: string): Promise<boolean> {
    if (this.asked.has(version)) return false;
    this.asked.add(version);
    return this.deps.prompt(kind, version);
  }
}
