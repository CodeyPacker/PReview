import { describe, expect, it, vi } from 'vitest';
import { GitHubAccounts, type GitHubAccountsDeps } from './accounts.ts';
import type { CredentialDirectory, GitHubCredentials } from './credential-store.ts';
import {
  GITHUB_CLIENT_ID,
  pollForToken,
  type DeviceCode,
  type Fetch,
  type Sleep,
} from './device-flow.ts';
import { GhCliError } from './gh-cli.ts';

const user = { login: 'octo', name: 'Octo Cat', avatarUrl: 'https://avatars.example/octo' };
const githubUser = { login: 'octo', name: 'Octo Cat', avatar_url: 'https://avatars.example/octo' };
const hubot = { login: 'Hubot', name: null, avatarUrl: 'https://avatars.example/hubot' };
const deviceCode = {
  device_code: 'device-1',
  user_code: 'ABCD-1234',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// Answers each GitHub endpoint from its own queue of responses.
function fakeGitHub(routes: Record<string, Response[]>) {
  return vi.fn<Fetch>((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    const next = routes[url]?.shift();
    if (!next) throw new Error(`Unexpected request to ${url}`);
    return Promise.resolve(next);
  });
}

// Credential files kept in memory, keyed by lowercase login.
function memoryDirectory(initial: GitHubCredentials[]) {
  const files = new Map(initial.map((stored) => [stored.user.login.toLowerCase(), stored]));
  const directory: CredentialDirectory = {
    logins: () => [...files.keys()].sort(),
    store: (login) => ({
      load: () => Promise.resolve(files.get(login.toLowerCase())),
      save: (credentials) => {
        files.set(login.toLowerCase(), credentials);
        return Promise.resolve();
      },
      clear: () => void files.delete(login.toLowerCase()),
    }),
  };
  return { directory, files };
}

async function setup(
  routes: Record<string, Response[]>,
  stored: GitHubCredentials[] = [],
  ghToken: GitHubAccountsDeps['ghToken'] = () => Promise.resolve('gho_cli'),
) {
  const { directory, files } = memoryDirectory(stored);
  const deps: GitHubAccountsDeps = {
    directory,
    fetch: fakeGitHub(routes),
    ghToken,
    sleep: () => Promise.resolve(),
    openUrl: vi.fn(),
    copyText: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn() },
  };
  return { accounts: await GitHubAccounts.restore(deps), files, deps };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('pollForToken', () => {
  const code: DeviceCode = {
    deviceCode: 'device-1',
    userCode: 'ABCD-1234',
    verificationUri: 'https://github.com/login/device',
    expiresIn: 900,
    interval: 5,
  };

  it('waits through pending responses and backs off on slow_down', async () => {
    const fetchFn = fakeGitHub({
      'https://github.com/login/oauth/access_token': [
        json({ error: 'authorization_pending' }),
        json({ error: 'slow_down', interval: 10 }),
        json({ access_token: 'gho_token' }),
      ],
    });
    const sleep = vi.fn<Sleep>(() => Promise.resolve());

    const token = await pollForToken(fetchFn, sleep, code, new AbortController().signal);

    expect(token).toBe('gho_token');
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5000, 5000, 10000]);
    const body = fetchFn.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('client_id')).toBe(GITHUB_CLIENT_ID);
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
  });

  it('explains an expired code', async () => {
    const fetchFn = fakeGitHub({
      'https://github.com/login/oauth/access_token': [json({ error: 'expired_token' })],
    });
    await expect(
      pollForToken(fetchFn, () => Promise.resolve(), code, new AbortController().signal),
    ).rejects.toThrow('The code expired');
  });
});

describe('GitHubAccounts', () => {
  it('hands out each stored token while connected', async () => {
    const connected = await setup({}, [{ source: 'oauth', token: 'gho_token', user }]);
    expect(await connected.accounts.get('OCTO')?.getToken()).toBe('gho_token');

    connected.accounts.disconnect('octo');
    expect(connected.accounts.get('octo')).toBeUndefined();

    const signedOut = await setup({});
    expect(signedOut.accounts.list()).toEqual([]);
  });

  it('connects through the device flow and stores the token', async () => {
    const { accounts, files, deps } = await setup({
      'https://github.com/login/device/code': [json(deviceCode)],
      'https://github.com/login/oauth/access_token': [json({ access_token: 'gho_token' })],
      'https://api.github.com/user': [json(githubUser)],
    });

    const pending = await accounts.connect();
    expect(pending).toMatchObject({ pending: { userCode: 'ABCD-1234' } });
    expect(deps.copyText).toHaveBeenCalledWith('ABCD-1234');
    expect(deps.openUrl).toHaveBeenCalledWith('https://github.com/login/device');

    await flush();
    expect(accounts.getState()).toEqual({
      accounts: [{ ...user, source: 'oauth' }],
      connected: { login: 'octo', replaced: false },
    });
    expect(files.get('octo')).toEqual({ source: 'oauth', token: 'gho_token', user });
  });

  it('reports a denied authorization and stores nothing', async () => {
    const { accounts, files } = await setup({
      'https://github.com/login/device/code': [json(deviceCode)],
      'https://github.com/login/oauth/access_token': [json({ error: 'access_denied' })],
    });

    await accounts.connect();
    await flush();
    expect(accounts.getState()).toEqual({
      accounts: [],
      error: 'Authorization was canceled on GitHub.',
    });
    expect(files.size).toBe(0);
  });

  it('reports a network failure without the raw error', async () => {
    const { accounts } = await setup({});
    expect(await accounts.connect()).toEqual({
      accounts: [],
      error: 'Could not reach GitHub. Check your connection and try again.',
    });
  });

  it('stops polling when canceled', async () => {
    const { accounts, files } = await setup({
      'https://github.com/login/device/code': [json(deviceCode)],
      'https://github.com/login/oauth/access_token': [json({ access_token: 'gho_token' })],
      'https://api.github.com/user': [json(githubUser)],
    });

    await accounts.connect();
    expect(accounts.cancel()).toEqual({ accounts: [] });
    await flush();
    expect(accounts.getState()).toEqual({ accounts: [] });
    expect(files.size).toBe(0);
  });

  it('starts connected from stored credentials and forgets them on disconnect', async () => {
    const { accounts, files } = await setup({}, [{ source: 'oauth', token: 'gho_token', user }]);
    expect(accounts.getState()).toEqual({ accounts: [{ ...user, source: 'oauth' }] });
    expect(accounts.disconnect('octo')).toEqual({ accounts: [] });
    expect(files.size).toBe(0);
  });

  it('restores every stored account in login order and disconnects one at a time', async () => {
    const { accounts, files } = await setup({}, [
      { source: 'oauth', token: 'gho_token', user },
      { source: 'cli', user: hubot },
    ]);
    expect(accounts.list().map((account) => account.login)).toEqual(['Hubot', 'octo']);

    accounts.disconnect('hubot');
    expect(accounts.list().map((account) => account.login)).toEqual(['octo']);
    expect([...files.keys()]).toEqual(['octo']);
  });

  it('tells listeners about added and removed accounts', async () => {
    const added = vi.fn();
    const removed = vi.fn();
    const first = await setup({}, [{ source: 'cli', user: hubot }]);
    first.accounts.listen({ added, removed });
    first.accounts.disconnect('hubot');
    expect(removed).toHaveBeenCalledWith('Hubot');

    const second = await setup({ 'https://api.github.com/user': [json(githubUser)] });
    second.accounts.listen({ added });
    await second.accounts.connectWithCli();
    expect(added).toHaveBeenCalledWith('octo');
  });

  it('disconnects an account when GitHub rejects its stored token', async () => {
    const { accounts, files } = await setup(
      { 'https://api.github.com/user': [json({ message: 'Bad credentials' }, 401)] },
      [{ source: 'oauth', token: 'gho_revoked', user }],
    );
    await accounts.verify();
    expect(accounts.getState()).toEqual({
      accounts: [],
      error: 'GitHub signed you out. Connect again to keep syncing pull requests.',
    });
    expect(files.size).toBe(0);
  });

  it('stays connected when GitHub cannot be reached', async () => {
    const { accounts, files } = await setup({}, [{ source: 'oauth', token: 'gho_token', user }]);
    await accounts.verify();
    expect(accounts.getState()).toEqual({ accounts: [{ ...user, source: 'oauth' }] });
    expect(files.get('octo')).toEqual({ source: 'oauth', token: 'gho_token', user });
  });

  it('refreshes the profile but keeps the stored login', async () => {
    const renamed = { ...githubUser, login: 'OCTO', name: 'New Name' };
    const { accounts } = await setup({ 'https://api.github.com/user': [json(renamed)] }, [
      { source: 'oauth', token: 'gho_token', user },
    ]);
    await accounts.verify();
    expect(accounts.get('octo')?.user).toEqual({ ...user, name: 'New Name' });
  });
});

describe('GitHubAccounts with the GitHub CLI', () => {
  it('connects with the CLI token and stores no token', async () => {
    const { accounts, files, deps } = await setup({
      'https://api.github.com/user': [json(githubUser)],
    });

    expect(await accounts.connectWithCli()).toEqual({
      accounts: [{ ...user, source: 'cli' }],
      connected: { login: 'octo', replaced: false },
    });
    expect(files.get('octo')).toEqual({ source: 'cli', user });
    const headers = vi.mocked(deps.fetch).mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer gho_cli');
  });

  it('adds a second account beside the first, and replaces one already connected', async () => {
    const { accounts, files } = await setup(
      { 'https://api.github.com/user': [json(githubUser), json(githubUser)] },
      [{ source: 'cli', user: hubot }],
    );

    await accounts.connectWithCli();
    expect(accounts.getState().accounts.map((account) => account.login)).toEqual(['Hubot', 'octo']);

    expect((await accounts.connectWithCli()).connected).toEqual({
      login: 'octo',
      replaced: true,
    });
    expect([...files.keys()].sort()).toEqual(['hubot', 'octo']);
  });

  it('reads the token from the CLI on each request', async () => {
    let token = 'gho_first';
    const { accounts } = await setup({}, [{ source: 'cli', user }], () => Promise.resolve(token));
    expect(accounts.getState()).toEqual({ accounts: [{ ...user, source: 'cli' }] });
    expect(await accounts.get('octo')?.getToken()).toBe('gho_first');
    token = 'gho_second';
    expect(await accounts.get('octo')?.getToken()).toBe('gho_second');
  });

  it('asks the CLI for the active account to connect, then for that login', async () => {
    const ghToken = vi.fn<GitHubAccountsDeps['ghToken']>(() => Promise.resolve('gho_cli'));
    const { accounts } = await setup(
      { 'https://api.github.com/user': [json(githubUser), json(githubUser)] },
      [],
      ghToken,
    );

    await accounts.connectWithCli();
    await accounts.get('octo')?.getToken();
    await accounts.verify();

    expect(ghToken.mock.calls).toEqual([[], ['octo'], ['octo']]);
  });

  it('hands out no token when the CLI has none', async () => {
    const { accounts } = await setup({}, [{ source: 'cli', user }], () =>
      Promise.reject(new GhCliError('The GitHub CLI is not signed in.')),
    );
    expect(await accounts.get('octo')?.getToken()).toBeUndefined();
    expect(accounts.getState()).toEqual({ accounts: [{ ...user, source: 'cli' }] });
  });

  it('explains a CLI that is missing or signed out', async () => {
    const { accounts, files } = await setup({}, [], () =>
      Promise.reject(new GhCliError('The GitHub CLI is not installed. Install gh and try again.')),
    );
    expect(await accounts.connectWithCli()).toEqual({
      accounts: [],
      error: 'The GitHub CLI is not installed. Install gh and try again.',
    });
    expect(files.size).toBe(0);
  });

  it('explains a CLI token that GitHub rejects', async () => {
    const { accounts } = await setup({
      'https://api.github.com/user': [json({ message: 'Bad credentials' }, 401)],
    });
    expect(await accounts.connectWithCli()).toEqual({
      accounts: [],
      error: 'GitHub rejected the GitHub CLI’s token. Run gh auth login again.',
    });
  });

  it('cancels a device flow in progress', async () => {
    const { accounts, files } = await setup({
      'https://github.com/login/device/code': [json(deviceCode)],
      'https://github.com/login/oauth/access_token': [json({ access_token: 'gho_token' })],
      'https://api.github.com/user': [json(githubUser), json(githubUser)],
    });

    await accounts.connect();
    await accounts.connectWithCli();
    await flush();
    expect(accounts.getState()).toEqual({
      accounts: [{ ...user, source: 'cli' }],
      connected: { login: 'octo', replaced: false },
    });
    expect(files.get('octo')).toEqual({ source: 'cli', user });
  });
});
