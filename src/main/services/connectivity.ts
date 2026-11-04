// How often the network is checked.
const POLL_MS = 10_000;
// After the computer wakes, its network often takes a few seconds to come back.
const RESUME_DELAY_MS = 5_000;

export interface ConnectivityWatchDeps {
  // Whether the computer has a network connection. It can't tell whether GitHub is reachable.
  isOnline: () => boolean;
  onReconnect: () => void;
  pollMs?: number;
  resumeDelayMs?: number;
}

// Calls onReconnect when the network comes back and when the computer wakes, so syncs and
// queued reviews don't wait out their backoff.
export class ConnectivityWatch {
  private online = true;
  private poll: ReturnType<typeof setInterval> | undefined;
  private resume: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: ConnectivityWatchDeps) {}

  start(): void {
    this.online = this.deps.isOnline();
    this.poll = setInterval(() => this.check(), this.deps.pollMs ?? POLL_MS);
  }

  stop(): void {
    clearInterval(this.poll);
    clearTimeout(this.resume);
  }

  // Call when the computer wakes from sleep.
  resumed(): void {
    clearTimeout(this.resume);
    this.resume = setTimeout(() => {
      this.online = this.deps.isOnline();
      if (this.online) this.deps.onReconnect();
    }, this.deps.resumeDelayMs ?? RESUME_DELAY_MS);
  }

  private check(): void {
    const online = this.deps.isOnline();
    if (online && !this.online) this.deps.onReconnect();
    this.online = online;
  }
}
