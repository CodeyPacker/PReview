import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import {
  GitHubApiError,
  GitHubNotConnectedError,
  GitHubRateLimitError,
} from '../../providers/github/client.ts';
import type { GitProvider, ProviderPullRequest } from '../../providers/types.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { updateRepositorySettings } from '../repositories/registry.ts';
import { MAX_BACKOFF_MS, PullRequestSync, SYNC_INTERVAL_MS } from './sync.ts';

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
    author: { login: 'hubot', avatarUrl: 'https://avatars.example/hubot' },
    headBranch: `feature-${number}`,
    headSha: 'abc',
    baseBranch: 'main',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: `2026-10-0${number}T00:00:00Z`,
    ...overrides,
  };
}

function setup(getPullRequests: Mock<GitProvider['getPullRequests']>) {
  const provider: GitProvider = { getRepositories: vi.fn(), getPullRequests };
  const log = { info: vi.fn(), warn: vi.fn() };
  return { sync: new PullRequestSync({ db, provider, log }), getPullRequests };
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
