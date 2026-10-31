import type { DatabaseSync } from 'node:sqlite';
import { ZodError } from 'zod';
import type {
  PullRequestsState,
  PullRequestSyncError,
} from '../../../shared/contracts/pull-requests.ts';
import {
  GitHubApiError,
  GitHubNotConnectedError,
  GitHubRateLimitError,
} from '../../providers/github/client.ts';
import type { GitProvider } from '../../providers/types.ts';
import { GitHubUnauthorizedError } from '../github/device-flow.ts';
import { listRepositories } from '../repositories/registry.ts';
import { listPullRequests, replacePullRequests } from './store.ts';

export const SYNC_INTERVAL_MS = 60_000;
export const MAX_BACKOFF_MS = 15 * 60_000;

export interface PullRequestSyncDeps {
  db: DatabaseSync;
  provider: GitProvider;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void };
}

function describeError(error: unknown): string {
  if (error instanceof GitHubRateLimitError) {
    return error.resetAt
      ? `GitHub rate limit reached. Syncing resumes at ${error.resetAt.toLocaleTimeString()}.`
      : 'GitHub rate limit reached. Syncing will retry later.';
  }
  if (error instanceof GitHubUnauthorizedError) {
    return 'GitHub rejected the token. Connect GitHub again.';
  }
  if (error instanceof GitHubApiError) {
    return error.status === 404
      ? 'GitHub can’t find this repository, or your account can’t access it.'
      : `GitHub returned an error (${error.status}).`;
  }
  if (error instanceof ZodError) return 'GitHub sent a response PReview could not read.';
  return 'Could not reach GitHub.';
}

// Keeps the stored pull requests of monitored repositories current. Polls about once a
// minute and backs off after failures. While GitHub is rate limiting, it makes no
// requests until the limit resets. Runs one sync at a time.
export class PullRequestSync {
  private running: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private started = false;
  private failures = 0;
  private blockedUntil = 0;
  private readonly errors = new Map<number, string>();

  constructor(private readonly deps: PullRequestSyncDeps) {}

  getState(): PullRequestsState {
    const errors: PullRequestSyncError[] = [...this.errors].map(([repositoryId, message]) => ({
      repositoryId,
      message,
    }));
    return {
      pullRequests: listPullRequests(this.deps.db),
      errors,
      syncing: this.running !== undefined,
    };
  }

  // Syncs now and keeps syncing on a timer.
  start(): void {
    this.started = true;
    void this.refresh();
  }

  stop(): void {
    this.started = false;
    clearTimeout(this.timer);
  }

  // Syncs now, unless a sync is running or GitHub is rate limiting.
  refresh(): Promise<void> {
    if (this.running) return this.running;
    if (Date.now() < this.blockedUntil) return Promise.resolve();
    clearTimeout(this.timer);
    this.running = this.run().finally(() => {
      this.running = undefined;
      this.schedule();
    });
    return this.running;
  }

  private schedule(): void {
    if (!this.started) return;
    const backoff = Math.min(SYNC_INTERVAL_MS * 2 ** this.failures, MAX_BACKOFF_MS);
    const delay = Math.max(backoff, this.blockedUntil - Date.now());
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), delay);
  }

  private async run(): Promise<void> {
    const repositories = listRepositories(this.deps.db).filter(
      (repository) =>
        repository.status === 'available' && repository.settings.monitored && repository.github,
    );
    const eligible = new Set(repositories.map((repository) => repository.id));
    for (const id of this.errors.keys()) if (!eligible.has(id)) this.errors.delete(id);

    let failed = false;
    for (const repository of repositories) {
      if (!repository.github) continue;
      const fullName = `${repository.github.owner}/${repository.github.name}`;
      try {
        replacePullRequests(
          this.deps.db,
          repository.id,
          await this.deps.provider.getPullRequests(fullName),
        );
        this.errors.delete(repository.id);
      } catch (error) {
        // Without a connection there is nothing to report. Connecting is the fix.
        if (error instanceof GitHubNotConnectedError) break;
        this.deps.log.warn(`Could not sync pull requests for ${fullName}`, error);
        this.errors.set(repository.id, describeError(error));
        if (error instanceof GitHubRateLimitError) {
          this.blockedUntil = (error.resetAt?.getTime() ?? Date.now() + MAX_BACKOFF_MS) + 1000;
          failed = true;
          break;
        }
        // A rejected token fails every repository the same way.
        if (error instanceof GitHubUnauthorizedError) {
          failed = true;
          break;
        }
        failed = true;
      }
    }
    this.failures = failed ? this.failures + 1 : 0;
  }
}
