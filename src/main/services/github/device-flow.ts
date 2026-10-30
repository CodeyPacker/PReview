import type { GitHubUser } from '../../../shared/contracts/github.ts';

// GitHub OAuth Device Flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
// The client ID is public. Device Flow needs no client secret.
export const GITHUB_CLIENT_ID = 'Ov23li1T51wPEz9dssTQ';

// repo: read pull requests in private repositories, submit reviews and merge.
// read:user: the signed-in user's profile.
export const GITHUB_SCOPES = 'repo read:user';

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export type Fetch = typeof fetch;
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

// Thrown when GitHub rejects a stored token. The user has to connect again.
export class GitHubUnauthorizedError extends Error {}

// Thrown when the device flow ends without a token. The message is shown to the user.
export class DeviceFlowError extends Error {}

const deviceFlowMessages: Record<string, string> = {
  expired_token: 'The code expired. Connect again to get a new one.',
  access_denied: 'Authorization was canceled on GitHub.',
  device_flow_disabled: 'Device Flow is turned off for this GitHub OAuth App.',
  incorrect_client_credentials: 'GitHub did not recognize this app’s client ID.',
};

async function postForm(fetchFn: Fetch, url: string, body: Record<string, string>) {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!response.ok) throw new DeviceFlowError(`GitHub returned ${response.status}.`);
  return (await response.json()) as Record<string, unknown>;
}

export async function requestDeviceCode(fetchFn: Fetch): Promise<DeviceCode> {
  const data = await postForm(fetchFn, 'https://github.com/login/device/code', {
    client_id: GITHUB_CLIENT_ID,
    scope: GITHUB_SCOPES,
  });
  if (typeof data.error === 'string') {
    throw new DeviceFlowError(deviceFlowMessages[data.error] ?? `GitHub error: ${data.error}`);
  }
  return {
    deviceCode: String(data.device_code),
    userCode: String(data.user_code),
    verificationUri: String(data.verification_uri),
    expiresIn: Number(data.expires_in),
    interval: Number(data.interval),
  };
}

// Polls until the user authorizes the code, then returns the access token. Waits the
// interval GitHub asks for between polls, and longer after a slow_down response.
export async function pollForToken(
  fetchFn: Fetch,
  sleep: Sleep,
  code: DeviceCode,
  signal: AbortSignal,
): Promise<string> {
  let interval = code.interval;
  for (;;) {
    await sleep(interval * 1000, signal);
    signal.throwIfAborted();
    const data = await postForm(fetchFn, 'https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      device_code: code.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    if (typeof data.access_token === 'string') return data.access_token;
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      interval = typeof data.interval === 'number' ? data.interval : interval + 5;
      continue;
    }
    const error = String(data.error);
    throw new DeviceFlowError(deviceFlowMessages[error] ?? `GitHub error: ${error}`);
  }
}

export async function fetchUser(fetchFn: Fetch, token: string): Promise<GitHubUser> {
  const response = await fetchFn('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 401) throw new GitHubUnauthorizedError('GitHub rejected the token.');
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for /user.`);
  const data = (await response.json()) as Record<string, unknown>;
  return {
    login: String(data.login),
    name: typeof data.name === 'string' ? data.name : null,
    avatarUrl: String(data.avatar_url),
  };
}
