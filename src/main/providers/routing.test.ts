import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { openDatabase } from '../database/connection.ts';
import { migrate } from '../database/migrate.ts';
import { GitHubUnauthorizedError } from '../services/github/device-flow.ts';
import {
  getRepositoryAccount,
  setRepositoryAccount,
} from '../services/github/repository-accounts.ts';
import {
  GitHubApiError,
  GitHubNoAccessError,
  GitHubNotConnectedError,
  GitHubRateLimitError,
} from './github/client.ts';
import { RoutingProvider, type AccountProvider } from './routing.ts';
import type { ProviderRepository } from './types.ts';

let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const repository = (canPush: boolean): ProviderRepository => ({
  provider: 'github',
  providerId: '1',
  fullName: 'octo/app',
  owner: 'octo',
  name: 'app',
  defaultBranch: 'main',
  private: true,
  archived: false,
  canPush,
});

type FakeProvider = Record<string, Mock>;

// A provider whose every method is a mock. getRepository answers with access.
function fakeProvider(access: boolean | 'push' | Error): FakeProvider {
  const mocks: FakeProvider = {
    getRepository: vi.fn(() => {
      if (access instanceof Error) return Promise.reject(access);
      if (access === false) return Promise.reject(new GitHubApiError(404, '/repos/octo/app'));
      return Promise.resolve(repository(access === 'push'));
    }),
  };
  return new Proxy(mocks, {
    get: (target, prop: string) => (target[prop] ??= vi.fn().mockResolvedValue([])),
  });
}

function setup(providers: Record<string, FakeProvider>) {
  const logins = vi.fn(() => Object.keys(providers));
  const createProvider = vi.fn((login: string) => {
    const provider = providers[login];
    if (!provider) throw new Error(`No provider for ${login}`);
    return provider as unknown as AccountProvider;
  });
  return { routing: new RoutingProvider({ db, logins, createProvider }), logins, createProvider };
}

describe('RoutingProvider', () => {
  it('sends each call with the account assigned to its repository', async () => {
    const personal = fakeProvider(true);
    const work = fakeProvider(true);
    const { routing, createProvider } = setup({ personal, work });
    setRepositoryAccount(db, 'me/site', 'personal', false);
    setRepositoryAccount(db, 'acme/api', 'work', true);

    await routing.getPullRequests('me/site');
    await routing.replyToThread('ACME/api', 'T1', 'Fixed.');
    await routing.getPullRequests('acme/api');

    expect(personal.getPullRequests).toHaveBeenCalledWith('me/site');
    expect(work.replyToThread).toHaveBeenCalledWith('ACME/api', 'T1', 'Fixed.');
    expect(work.getPullRequests).toHaveBeenCalledWith('acme/api');
    expect(createProvider).toHaveBeenCalledTimes(2);
  });

  it('rejects a call for a repository with no account, or whose account is gone', async () => {
    const { routing } = setup({ personal: fakeProvider(true) });
    await expect(routing.getPullRequests('me/site')).rejects.toBeInstanceOf(
      GitHubNotConnectedError,
    );

    setRepositoryAccount(db, 'me/site', 'disconnected', false);
    await expect(routing.getPullRequests('me/site')).rejects.toBeInstanceOf(
      GitHubNotConnectedError,
    );
  });

  it('matches the assigned login in any case', () => {
    const { routing } = setup({ Octo: fakeProvider(true) });
    setRepositoryAccount(db, 'octo/app', 'octo', false);
    expect(routing.accountFor('Octo/App')).toBe('Octo');
  });

  it('names the account on rate limit and rejected token errors', async () => {
    const work = fakeProvider(true);
    work.getPullRequests?.mockRejectedValueOnce(new GitHubRateLimitError(undefined));
    work.getChecks?.mockRejectedValueOnce(new GitHubUnauthorizedError('rejected'));
    const { routing } = setup({ work });
    setRepositoryAccount(db, 'acme/api', 'work', false);

    await expect(routing.getPullRequests('acme/api')).rejects.toMatchObject({ login: 'work' });
    await expect(routing.getChecks('acme/api', 1, 'abc')).rejects.toMatchObject({
      login: 'work',
    });
  });
});

describe('RoutingProvider.assign', () => {
  it('picks the first account that can push', async () => {
    const { routing } = setup({
      a: fakeProvider(true),
      b: fakeProvider('push'),
      c: fakeProvider('push'),
    });
    await expect(routing.assign('octo/app')).resolves.toBe('b');
    expect(getRepositoryAccount(db, 'octo/app')).toEqual({ login: 'b', manual: false });
  });

  it('falls back to the first account that can read', async () => {
    const { routing } = setup({
      a: fakeProvider(false),
      b: fakeProvider(true),
      c: fakeProvider(true),
    });
    await expect(routing.assign('octo/app')).resolves.toBe('b');
  });

  it('treats a 403 as no access', async () => {
    const { routing } = setup({
      a: fakeProvider(new GitHubApiError(403, '/repos/octo/app')),
      b: fakeProvider(true),
    });
    await expect(routing.assign('octo/app')).resolves.toBe('b');
  });

  it('reports when no account can read the repository', async () => {
    const { routing } = setup({ a: fakeProvider(false), b: fakeProvider(false) });
    await expect(routing.assign('octo/app')).rejects.toBeInstanceOf(GitHubNoAccessError);
    expect(getRepositoryAccount(db, 'octo/app')).toBeUndefined();
  });

  it('waits for an account that could not answer before settling for read access', async () => {
    const { routing } = setup({
      a: fakeProvider(new GitHubRateLimitError(undefined)),
      b: fakeProvider(true),
    });
    await expect(routing.assign('octo/app')).rejects.toMatchObject({ login: 'a' });
    expect(getRepositoryAccount(db, 'octo/app')).toBeUndefined();
  });

  it('still assigns an account that can push when another could not answer', async () => {
    const { routing } = setup({
      a: fakeProvider(new Error('offline')),
      b: fakeProvider('push'),
    });
    await expect(routing.assign('octo/app')).resolves.toBe('b');
  });

  it('rejects with not connected when there are no accounts', async () => {
    const { routing } = setup({});
    await expect(routing.assign('octo/app')).rejects.toBeInstanceOf(GitHubNotConnectedError);
  });
});
