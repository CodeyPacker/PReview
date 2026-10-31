import { describe, expect, it, vi } from 'vitest';
import { GitHubAuth, type GitHubAuthDeps } from './auth.ts';
import type { CredentialStore, GitHubCredentials } from './credential-store.ts';
import {
  GITHUB_CLIENT_ID,
  pollForToken,
  type DeviceCode,
  type Fetch,
  type Sleep,
} from './device-flow.ts';

const user = { login: 'octo', name: 'Octo Cat', avatarUrl: 'https://avatars.example/octo' };
const githubUser = { login: 'octo', name: 'Octo Cat', avatar_url: 'https://avatars.example/octo' };
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

function memoryStore(initial?: GitHubCredentials): CredentialStore & { value?: GitHubCredentials } {
  return {
    value: initial,
    load() {
      return Promise.resolve(this.value);
    },
    save(credentials) {
      this.value = credentials;
      return Promise.resolve();
    },
    clear() {
      this.value = undefined;
    },
  };
}

async function setup(routes: Record<string, Response[]>, stored?: GitHubCredentials) {
  const store = memoryStore(stored);
  const deps: GitHubAuthDeps = {
    store,
    fetch: fakeGitHub(routes),
    sleep: () => Promise.resolve(),
    openUrl: vi.fn(),
    copyText: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn() },
  };
  return { auth: await GitHubAuth.restore(deps), store, deps };
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

describe('GitHubAuth', () => {
  it('hands out the stored token only while connected', async () => {
    const connected = await setup({}, { token: 'gho_token', user });
    expect(await connected.auth.getToken()).toBe('gho_token');

    connected.auth.disconnect();
    expect(await connected.auth.getToken()).toBeUndefined();

    const signedOut = await setup({});
    expect(await signedOut.auth.getToken()).toBeUndefined();
  });

  it('connects through the device flow and stores the token', async () => {
    const { auth, store, deps } = await setup({
      'https://github.com/login/device/code': [json(deviceCode)],
      'https://github.com/login/oauth/access_token': [json({ access_token: 'gho_token' })],
      'https://api.github.com/user': [json(githubUser)],
    });

    const pending = await auth.connect();
    expect(pending).toMatchObject({ status: 'pending', userCode: 'ABCD-1234' });
    expect(deps.copyText).toHaveBeenCalledWith('ABCD-1234');
    expect(deps.openUrl).toHaveBeenCalledWith('https://github.com/login/device');

    await flush();
    expect(auth.getState()).toEqual({ status: 'connected', user });
    expect(store.value).toEqual({ token: 'gho_token', user });
  });

  it('reports a denied authorization and stores nothing', async () => {
    const { auth, store } = await setup({
      'https://github.com/login/device/code': [json(deviceCode)],
      'https://github.com/login/oauth/access_token': [json({ error: 'access_denied' })],
    });

    await auth.connect();
    await flush();
    expect(auth.getState()).toEqual({
      status: 'disconnected',
      error: 'Authorization was canceled on GitHub.',
    });
    expect(store.value).toBeUndefined();
  });

  it('reports a network failure without the raw error', async () => {
    const { auth } = await setup({});
    expect(await auth.connect()).toEqual({
      status: 'disconnected',
      error: 'Could not reach GitHub. Check your connection and try again.',
    });
  });

  it('stops polling when canceled', async () => {
    const { auth, store } = await setup({
      'https://github.com/login/device/code': [json(deviceCode)],
      'https://github.com/login/oauth/access_token': [json({ access_token: 'gho_token' })],
      'https://api.github.com/user': [json(githubUser)],
    });

    await auth.connect();
    expect(auth.cancel()).toEqual({ status: 'disconnected' });
    await flush();
    expect(auth.getState()).toEqual({ status: 'disconnected' });
    expect(store.value).toBeUndefined();
  });

  it('starts connected from stored credentials and forgets them on disconnect', async () => {
    const { auth, store } = await setup({}, { token: 'gho_token', user });
    expect(auth.getState()).toEqual({ status: 'connected', user });
    expect(auth.disconnect()).toEqual({ status: 'disconnected' });
    expect(store.value).toBeUndefined();
  });

  it('disconnects when GitHub rejects the stored token', async () => {
    const { auth, store } = await setup(
      { 'https://api.github.com/user': [json({ message: 'Bad credentials' }, 401)] },
      { token: 'gho_revoked', user },
    );
    await auth.verify();
    expect(auth.getState()).toEqual({
      status: 'disconnected',
      error: 'GitHub signed you out. Connect again to keep syncing pull requests.',
    });
    expect(store.value).toBeUndefined();
  });

  it('stays connected when GitHub cannot be reached', async () => {
    const { auth, store } = await setup({}, { token: 'gho_token', user });
    await auth.verify();
    expect(auth.getState()).toEqual({ status: 'connected', user });
    expect(store.value).toEqual({ token: 'gho_token', user });
  });
});
