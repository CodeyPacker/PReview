import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import {
  GitHubApiError,
  GitHubNoAccessError,
  GitHubNotConnectedError,
  GitHubRateLimitError,
} from '../../providers/github/client.ts';
import type { GitProvider, ProviderPullRequest } from '../../providers/types.ts';
import { GitHubUnauthorizedError } from '../github/device-flow.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { updateRepositorySettings } from '../repositories/registry.ts';
import {
  MAX_BACKOFF_MS,
  PullRequestSync,
  SYNC_INTERVAL_MS,
  type PullRequestSyncDeps,
} from './sync.ts';

// Each repository's account: personal/* repositories use personal, the rest use work.
const byOwner = () =>
  vi.fn((fullName: string) => (fullName.startsWith('personal/') ? 'personal' : 'work'));

function rateLimited(login: string, resetAt: Date) {
  const error = new GitHubRateLimitError(resetAt);
  error.login = login;
  return error;
}

let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  vi.useFakeTimers();
  db = openDatabase(':memory:');
  migrate(db);
});

afterEach(() => vi.useRealTimers());

function addRepository(name: string, remote: string | null = `git@github.com:octo/${name}.git`) {
  reconcileRepositories(db, [
    ...(
      db.prepare('SELECT path, name, remote_url, root_commit FROM repositories').all() as {
        path: string;
        name: string;
        remote_url: string | null;
        root_commit: string | null;
      }[]
    ).map((row) => ({
      path: row.path,
      name: row.name,
      remoteUrl: row.remote_url,
      rootCommit: row.root_commit,
    })),
    { path: `/code/${name}`, name, remoteUrl: remote, rootCommit: `root-${name}` },
  ]);
  const row = db.prepare('SELECT id FROM repositories WHERE path = ?').get(`/code/${name}`) as {
    id: number;
  };
  return row.id;
}

function pull(number: number, overrides: Partial<ProviderPullRequest> = {}): ProviderPullRequest {
  return {
    provider: 'github',
    providerId: String(number * 10),
    number,
    title: `PR ${number}`,
    draft: false,
    url: `https://github.com/octo/app/pull/${number}`,
    author: { login: 'hubot', avatarUrl: 'https://avatars.example/hubot', bot: false },
    headBranch: `feature-${number}`,
    headSha: 'abc',
    baseBranch: 'main',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: `2026-10-0${number}T00:00:00Z`,
    ...overrides,
  };
}

interface Routing {
  accountFor?: Mock<(fullName: string) => string | undefined>;
  assign?: Mock<(fullName: string) => Promise<string>>;
}

function setup(getPullRequests: Mock<GitProvider['getPullRequests']>, routing: Routing = {}) {
  const accountFor = routing.accountFor ?? vi.fn(() => 'octo');
  const assign = routing.assign ?? vi.fn(() => Promise.resolve('octo'));
  const provider: PullRequestSyncDeps['provider'] = {
    accountFor,
    assign,
    getPullRequests,
    getPullRequestRefs: vi.fn(),
    getPullRequestFiles: vi.fn(),
    getPullRequestCommits: vi.fn(),
    getCommitChanges: vi.fn(),
    getChangesBetween: vi.fn(),
    getRepositoryFiles: vi.fn(),
    getMergeBase: vi.fn(),
    getFileContent: vi.fn(),
    getFileBytes: vi.fn(),
    getReviewThreads: vi.fn(),
    replyToThread: vi.fn(),
    setThreadResolved: vi.fn(),
    submitReview: vi.fn(),
    mergePullRequest: vi.fn(),
    deleteBranch: vi.fn(),
    getReviews: vi.fn(),
    getPullRequestDetails: vi.fn(),
    getChecks: vi.fn(),
  };
  const log = { info: vi.fn(), warn: vi.fn() };
  const notify = vi.fn();
  return {
    sync: new PullRequestSync({ db, provider, log, notify }),
    getPullRequests,
    accountFor,
    assign,
    notify,
  };
}

describe('PullRequestSync', () => {
  it('stores the open pull requests of a monitored repository', async () => {
    const id = addRepository('app');
    const { sync } = setup(vi.fn().mockResolvedValue([pull(1), pull(2)]));

    await sync.refresh();

    const state = sync.getState();
    expect(state.syncing).toBe(false);
    expect(state.errors).toEqual([]);
    expect(state.pullRequests.map((p) => [p.repositoryId, p.number, p.title])).toEqual([
      [id, 2, 'PR 2'],
      [id, 1, 'PR 1'],
    ]);
    expect(state.pullRequests[0]?.author).toEqual({
      login: 'hubot',
      avatarUrl: 'https://avatars.example/hubot',
      bot: false,
    });
  });

  it('updates changed pull requests and removes ones that are no longer open', async () => {
    addRepository('app');
    const getPullRequests = vi
      .fn()
      .mockResolvedValueOnce([pull(1), pull(2)])
      .mockResolvedValueOnce([pull(2, { title: 'Renamed', draft: true })]);
    const { sync } = setup(getPullRequests);

    await sync.refresh();
    await sync.refresh();

    expect(sync.getState().pullRequests.map((p) => [p.number, p.title, p.draft])).toEqual([
      [2, 'Renamed', true],
    ]);
  });

  it('announces pull requests new to the Inbox after the first sync, except your own', async () => {
    addRepository('app');
    const mine = { login: 'Octo', avatarUrl: 'https://avatars.example/octo', bot: false };
    const getPullRequests = vi
      .fn()
      .mockResolvedValueOnce([pull(1)])
      .mockResolvedValueOnce([pull(1), pull(2), pull(3, { author: mine })])
      .mockResolvedValueOnce([pull(1), pull(2), pull(4), pull(5)]);
    const { sync, notify } = setup(getPullRequests);

    await sync.refresh();
    expect(notify).not.toHaveBeenCalled();

    await sync.refresh();
    expect(notify).toHaveBeenCalledExactlyOnceWith('New pull request', 'octo/app#2: PR 2');

    await sync.refresh();
    expect(notify).toHaveBeenLastCalledWith('2 new pull requests', 'PR 5, PR 4');
  });

  it('leaves out drafts and automated pull requests where the repository excludes them', async () => {
    const id = addRepository('app');
    const bot = { login: 'dependabot[bot]', avatarUrl: 'https://avatars.example/bot', bot: true };
    const { sync } = setup(
      vi.fn().mockResolvedValue([pull(1), pull(2, { draft: true }), pull(3, { author: bot })]),
    );
    await sync.refresh();
    expect(sync.getState().pullRequests).toHaveLength(3);

    updateRepositorySettings(db, id, { includeDrafts: false });
    expect(sync.getState().pullRequests.map((p) => p.number)).toEqual([3, 1]);

    updateRepositorySettings(db, id, { includeAutomated: false });
    expect(sync.getState().pullRequests.map((p) => p.number)).toEqual([1]);
  });

  it('keeps pull requests that have no author', async () => {
    addRepository('app');
    const { sync } = setup(vi.fn().mockResolvedValue([pull(1, { author: null })]));

    await sync.refresh();

    expect(sync.getState().pullRequests[0]?.author).toBeNull();
  });

  it('syncs only monitored, available repositories with a GitHub remote', async () => {
    addRepository('paused');
    addRepository('local-only', null);
    addRepository('app');
    updateRepositorySettings(db, 1, { monitored: false });
    const getPullRequests = vi.fn().mockResolvedValue([]);
    const { sync } = setup(getPullRequests);

    await sync.refresh();

    expect(getPullRequests).toHaveBeenCalledTimes(1);
    expect(getPullRequests).toHaveBeenCalledWith('octo/app');
  });

  it('hides the pull requests of a repository once it is paused', async () => {
    const id = addRepository('app');
    const { sync } = setup(vi.fn().mockResolvedValue([pull(1)]));
    await sync.refresh();

    updateRepositorySettings(db, id, { monitored: false });

    expect(sync.getState().pullRequests).toEqual([]);
  });

  it('reports a failing repository and keeps its earlier pull requests', async () => {
    const id = addRepository('app');
    const getPullRequests = vi
      .fn()
      .mockResolvedValueOnce([pull(1)])
      .mockRejectedValueOnce(new GitHubApiError(404, '/repos/octo/app/pulls'));
    const { sync } = setup(getPullRequests);

    await sync.refresh();
    await sync.refresh();

    const state = sync.getState();
    expect(state.errors).toEqual([
      { repositoryId: id, message: expect.stringContaining('can’t find') as string },
    ]);
    expect(state.pullRequests).toHaveLength(1);
  });

  it('continues with other repositories after one fails and clears the error on success', async () => {
    addRepository('broken');
    addRepository('app');
    const getPullRequests = vi.fn<GitProvider['getPullRequests']>((name) =>
      name === 'octo/broken' ? Promise.reject(new Error('offline')) : Promise.resolve([pull(1)]),
    );
    const { sync } = setup(getPullRequests);

    await sync.refresh();
    expect(sync.getState().errors).toHaveLength(1);
    expect(sync.getState().pullRequests).toHaveLength(1);

    getPullRequests.mockResolvedValue([]);
    await sync.refresh();
    expect(sync.getState().errors).toEqual([]);
  });

  it('does nothing visible when GitHub is not connected', async () => {
    addRepository('app');
    const { sync } = setup(vi.fn().mockRejectedValue(new GitHubNotConnectedError('no token')));

    await sync.refresh();

    expect(sync.getState().errors).toEqual([]);
  });

  it('picks an account for a repository before its first sync', async () => {
    addRepository('app');
    const accountFor = vi.fn<(fullName: string) => string | undefined>(() => undefined);
    const { sync, assign, getPullRequests } = setup(vi.fn().mockResolvedValue([pull(1)]), {
      accountFor,
    });

    await sync.refresh();

    expect(assign).toHaveBeenCalledWith('octo/app');
    expect(getPullRequests).toHaveBeenCalledWith('octo/app');
    expect(sync.getState().pullRequests).toHaveLength(1);
  });

  it('reports a repository no account can access, and keeps syncing the others', async () => {
    const broken = addRepository('secret');
    addRepository('app');
    const getPullRequests = vi.fn().mockResolvedValue([pull(1)]);
    const { sync } = setup(getPullRequests, {
      accountFor: vi.fn((name: string) => (name === 'octo/app' ? 'octo' : undefined)),
      assign: vi.fn(() => Promise.reject(new GitHubNoAccessError())),
    });

    await sync.refresh();

    expect(sync.getState().errors).toEqual([
      { repositoryId: broken, message: 'No connected account can access this repository.' },
    ]);
    expect(getPullRequests).toHaveBeenCalledWith('octo/app');
  });

  it('reports nothing when no account is connected', async () => {
    addRepository('app');
    const { sync, getPullRequests } = setup(vi.fn(), {
      accountFor: vi.fn(() => undefined),
      assign: vi.fn(() => Promise.reject(new GitHubNotConnectedError('no accounts'))),
    });

    await sync.refresh();

    expect(getPullRequests).not.toHaveBeenCalled();
    expect(sync.getState().errors).toEqual([]);
  });

  it('keeps syncing one account while GitHub rate limits another', async () => {
    addRepository('first', 'git@github.com:work/first.git');
    addRepository('second', 'git@github.com:work/second.git');
    addRepository('site', 'git@github.com:personal/site.git');
    const getPullRequests = vi.fn<GitProvider['getPullRequests']>((name) =>
      name.startsWith('work/')
        ? Promise.reject(rateLimited('work', new Date(Date.now() + 10 * 60_000)))
        : Promise.resolve([]),
    );
    const { sync } = setup(getPullRequests, { accountFor: byOwner() });

    await sync.refresh();
    // The first work repository hit the limit, so the second was not tried.
    expect(getPullRequests.mock.calls.map(([name]) => name)).toEqual([
      'personal/site',
      'work/first',
    ]);

    await sync.refresh();
    expect(getPullRequests.mock.calls.map(([name]) => name)).toEqual([
      'personal/site',
      'work/first',
      'personal/site',
    ]);
  });

  it('stops an account after GitHub rejects its token, but not the others', async () => {
    addRepository('first', 'git@github.com:work/first.git');
    addRepository('second', 'git@github.com:work/second.git');
    addRepository('site', 'git@github.com:personal/site.git');
    const rejected = new GitHubUnauthorizedError('rejected');
    rejected.login = 'work';
    const getPullRequests = vi.fn<GitProvider['getPullRequests']>((name) =>
      name.startsWith('work/') ? Promise.reject(rejected) : Promise.resolve([pull(1)]),
    );
    const { sync } = setup(getPullRequests, { accountFor: byOwner() });

    await sync.refresh();

    expect(getPullRequests.mock.calls.map(([name]) => name)).toEqual([
      'personal/site',
      'work/first',
    ]);
    expect(sync.getState().errors[0]?.message).toBe(
      'GitHub rejected the token for work. Connect that account again.',
    );
    expect(sync.getState().pullRequests).toHaveLength(1);
  });

  it('backs off a failing account on the timer while the other keeps its interval', async () => {
    addRepository('api', 'git@github.com:work/api.git');
    addRepository('site', 'git@github.com:personal/site.git');
    const getPullRequests = vi.fn<GitProvider['getPullRequests']>((name) =>
      name.startsWith('work/') ? Promise.reject(new Error('offline')) : Promise.resolve([]),
    );
    const { sync } = setup(getPullRequests, { accountFor: byOwner() });
    const calls = (name: string) =>
      getPullRequests.mock.calls.filter(([called]) => called === name).length;

    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(calls('personal/site')).toBe(2);
    expect(calls('work/api')).toBe(1);

    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(calls('personal/site')).toBe(3);
    expect(calls('work/api')).toBe(2);
    sync.stop();
  });

  it('runs one sync at a time', async () => {
    addRepository('app');
    let finish: (pulls: ProviderPullRequest[]) => void = () => undefined;
    const getPullRequests = vi.fn(
      () => new Promise<ProviderPullRequest[]>((resolve) => (finish = resolve)),
    );
    const { sync } = setup(getPullRequests);

    const first = sync.refresh();
    const second = sync.refresh();
    expect(sync.getState().syncing).toBe(true);
    finish([]);
    await Promise.all([first, second]);

    expect(getPullRequests).toHaveBeenCalledTimes(1);
    expect(sync.getState().syncing).toBe(false);
  });

  describe('scheduling', () => {
    it('syncs again every interval after start', async () => {
      addRepository('app');
      const { sync, getPullRequests } = setup(vi.fn().mockResolvedValue([]));

      sync.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(getPullRequests).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(getPullRequests).toHaveBeenCalledTimes(2);

      sync.stop();
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 3);
      expect(getPullRequests).toHaveBeenCalledTimes(2);
    });

    it('backs off after failures and resets after a success', async () => {
      addRepository('app');
      const getPullRequests = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue([]);
      const { sync } = setup(getPullRequests);

      sync.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(getPullRequests).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2 - 1);
      expect(getPullRequests).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(getPullRequests).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 4);
      expect(getPullRequests).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(getPullRequests).toHaveBeenCalledTimes(4);
      sync.stop();
    });

    it('caps the backoff', async () => {
      addRepository('app');
      const { sync, getPullRequests } = setup(vi.fn().mockRejectedValue(new Error('offline')));

      sync.start();
      await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS * 20);
      const calls = getPullRequests.mock.calls.length;
      await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
      expect(getPullRequests.mock.calls.length).toBe(calls + 1);
      sync.stop();
    });

    it('stops requesting until the rate limit resets, even for a manual refresh', async () => {
      addRepository('app');
      const resetAt = new Date(Date.now() + 10 * 60_000);
      const getPullRequests = vi
        .fn()
        .mockRejectedValueOnce(new GitHubRateLimitError(resetAt))
        .mockResolvedValue([pull(1)]);
      const { sync } = setup(getPullRequests);

      sync.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(sync.getState().errors[0]?.message).toContain('rate limit');

      await sync.refresh();
      await vi.advanceTimersByTimeAsync(9 * 60_000);
      expect(getPullRequests).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2 * 60_000);
      expect(getPullRequests).toHaveBeenCalledTimes(2);
      expect(sync.getState().errors).toEqual([]);
      sync.stop();
    });
  });
});
