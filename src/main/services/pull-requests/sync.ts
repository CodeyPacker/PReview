import type { DatabaseSync } from 'node:sqlite';
import { ZodError } from 'zod';
import type {
  PullRequestsState,
  PullRequestSyncError,
} from '../../../shared/contracts/pull-requests.ts';
import {
  GitHubApiError,
  GitHubNoAccessError,
  GitHubNotConnectedError,
  GitHubRateLimitError,
} from '../../providers/github/client.ts';
import type { RoutingProvider } from '../../providers/routing.ts';
import type { GitProvider } from '../../providers/types.ts';
import { GitHubUnauthorizedError } from '../github/device-flow.ts';
import { listRepositories } from '../repositories/registry.ts';
import { listPullRequests, replacePullRequests } from './store.ts';

export const SYNC_INTERVAL_MS = 60_000;
export const MAX_BACKOFF_MS = 15 * 60_000;

export interface PullRequestSyncDeps {
  db: DatabaseSync;
  // Sends each repository's calls with its account, and assigns accounts to new repositories.
  provider: GitProvider & Pick<RoutingProvider, 'accountFor' | 'assign'>;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void };
  // Tells the user about pull requests new to the Inbox.
  notify?: (title: string, body: string) => void;
}

// When an account may sync again.
interface AccountSync {
  failures: number;
  // After a failure, timer syncs skip the account until then. A manual refresh doesn't.
  retryAt: number;
  // While GitHub is rate limiting the account, nothing syncs it until then.
  blockedUntil: number;
}

function describeError(error: unknown): string {
  if (error instanceof GitHubRateLimitError) {
    return error.resetAt
      ? `GitHub rate limit reached. Syncing resumes at ${error.resetAt.toLocaleTimeString()}.`
      : 'GitHub rate limit reached. Syncing will retry later.';
  }
  if (error instanceof GitHubUnauthorizedError) {
    return error.login
      ? `GitHub rejected the token for ${error.login}. Connect that account again.`
      : 'GitHub rejected the token. Connect GitHub again.';
  }
  if (error instanceof GitHubNoAccessError) return error.message;
  if (error instanceof GitHubApiError) {
    return error.status === 404
      ? 'GitHub can’t find this repository, or your account can’t access it.'
      : `GitHub returned an error (${error.status}).`;
  }
  if (error instanceof ZodError) return 'GitHub sent a response PReview could not read.';
  return 'Could not reach GitHub.';
}

// Keeps the stored pull requests of monitored repositories current. Polls about once a
// minute. Each account backs off after its own failures, and makes no requests while GitHub
// rate limits it, so one account's trouble never stops another's repositories. Runs one sync
// at a time.
export class PullRequestSync {
  private running: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private started = false;
  private readonly accounts = new Map<string, AccountSync>();
  private readonly errors = new Map<number, string>();
  // Repositories synced since the app started.
  private readonly synced = new Set<number>();

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

  // Syncs now, unless a sync is running. Accounts GitHub is rate limiting are skipped. A timer
  // sync also skips accounts backing off after a failure.
  refresh(manual = true): Promise<void> {
    if (this.running) return this.running;
    clearTimeout(this.timer);
    this.running = this.run(manual).finally(() => {
      this.running = undefined;
      this.schedule();
    });
    return this.running;
  }

  private schedule(): void {
    if (!this.started) return;
    const now = Date.now();
    let next = now + SYNC_INTERVAL_MS;
    if (this.accounts.size > 0) {
      next = Math.min(
        ...[...this.accounts.values()].map((account) =>
          Math.max(account.retryAt, account.blockedUntil, now + SYNC_INTERVAL_MS),
        ),
      );
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(false), next - now);
  }

  private account(login: string): AccountSync {
    const key = login.toLowerCase();
    let account = this.accounts.get(key);
    if (!account) {
      account = { failures: 0, retryAt: 0, blockedUntil: 0 };
      this.accounts.set(key, account);
    }
    return account;
  }

  private async run(manual: boolean): Promise<void> {
    const repositories = listRepositories(this.deps.db).filter(
      (repository) =>
        repository.status === 'available' && repository.settings.monitored && repository.github,
    );
    const eligible = new Set(repositories.map((repository) => repository.id));
    for (const id of this.errors.keys()) if (!eligible.has(id)) this.errors.delete(id);

    const before = new Set(listPullRequests(this.deps.db).map((pull) => pull.id));
    // Repositories whose new pull requests are announced, with each one's name and account. A
    // repository's first sync isn't, so adding one doesn't announce everything already open.
    const announced = new Map<number, { fullName: string; login: string }>();
    const now = Date.now();
    const attempted = new Set<string>();
    const failed = new Set<string>();
    // Accounts that hit a rate limit or a rejected token in this run. Their other
    // repositories would fail the same way.
    const stopped = new Set<string>();

    for (const repository of repositories) {
      if (!repository.github) continue;
      const fullName = `${repository.github.owner}/${repository.github.name}`;

      let login = this.deps.provider.accountFor(fullName);
      if (!login) {
        try {
          login = await this.deps.provider.assign(fullName);
        } catch (error) {
          // With no account connected there is nothing to report. Connecting is the fix.
          if (error instanceof GitHubNotConnectedError) continue;
          this.deps.log.warn(`Could not pick a GitHub account for ${fullName}`, error);
          this.errors.set(repository.id, describeError(error));
          if (error instanceof GitHubRateLimitError && error.login) this.block(error);
          continue;
        }
      }

      const key = login.toLowerCase();
      const account = this.account(key);
      if (stopped.has(key) || now < account.blockedUntil) continue;
      if (!manual && now < account.retryAt) continue;
      attempted.add(key);

      const seen =
        this.synced.has(repository.id) ||
        this.deps.db
          .prepare('SELECT 1 FROM pull_requests WHERE repository_id = ? LIMIT 1')
          .get(repository.id) !== undefined;
      try {
        replacePullRequests(
          this.deps.db,
          repository.id,
          await this.deps.provider.getPullRequests(fullName),
        );
        this.errors.delete(repository.id);
        this.synced.add(repository.id);
        if (seen) announced.set(repository.id, { fullName, login: key });
      } catch (error) {
        // The account was disconnected during the sync. The next sync reassigns it.
        if (error instanceof GitHubNotConnectedError) continue;
        this.deps.log.warn(`Could not sync pull requests for ${fullName} as ${login}`, error);
        this.errors.set(repository.id, describeError(error));
        failed.add(key);
        if (error instanceof GitHubRateLimitError) {
          this.block(error, login);
          stopped.add(key);
        }
        if (error instanceof GitHubUnauthorizedError) stopped.add(key);
      }
    }

    this.announce(before, announced);

    const done = Date.now();
    for (const key of attempted) {
      const account = this.account(key);
      account.failures = failed.has(key) ? account.failures + 1 : 0;
      account.retryAt =
        account.failures > 0
          ? done + Math.min(SYNC_INTERVAL_MS * 2 ** account.failures, MAX_BACKOFF_MS)
          : 0;
    }
  }

  // Notifies about pull requests that weren't in the Inbox before this sync, except the user's
  // own.
  private announce(
    before: ReadonlySet<number>,
    announced: ReadonlyMap<number, { fullName: string; login: string }>,
  ): void {
    const fresh = listPullRequests(this.deps.db).filter((pull) => {
      const repository = announced.get(pull.repositoryId);
      return (
        repository && !before.has(pull.id) && pull.author?.login.toLowerCase() !== repository.login
      );
    });
    const [first] = fresh;
    if (!first || !this.deps.notify) return;
    if (fresh.length === 1) {
      const { fullName } = announced.get(first.repositoryId)!;
      this.deps.notify('New pull request', `${fullName}#${first.number}: ${first.title}`);
      return;
    }
    const titles = fresh.slice(0, 3).map((pull) => pull.title);
    const more = fresh.length - titles.length;
    this.deps.notify(
      `${fresh.length} new pull requests`,
      titles.join(', ') + (more > 0 ? `, and ${more} more` : ''),
    );
  }

  private block(error: GitHubRateLimitError, login = error.login) {
    if (!login) return;
    this.account(login).blockedUntil =
      (error.resetAt?.getTime() ?? Date.now() + MAX_BACKOFF_MS) + 1000;
  }
}
