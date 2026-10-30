import type { GitHubAuthState } from '../../../shared/contracts/github.ts';
import { SecureStorageUnavailableError, type CredentialStore } from './credential-store.ts';
import {
  DeviceFlowError,
  fetchUser,
  GitHubUnauthorizedError,
  pollForToken,
  requestDeviceCode,
  type DeviceCode,
  type Fetch,
  type Sleep,
} from './device-flow.ts';

export interface GitHubAuthDeps {
  store: CredentialStore;
  fetch: Fetch;
  sleep: Sleep;
  // Opens GitHub's device page in the system browser.
  openUrl: (url: string) => void;
  // Copies the user code, so the user only has to paste it.
  copyText: (text: string) => void;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void };
}

const SIGNED_OUT = 'GitHub signed you out. Connect again to keep syncing pull requests.';

// Owns the GitHub connection: the device flow, the stored token and the state the
// renderer reads. Holds at most one device flow at a time.
export class GitHubAuth {
  private state: GitHubAuthState = { status: 'disconnected' };
  private flow: AbortController | undefined;

  constructor(private readonly deps: GitHubAuthDeps) {
    const stored = deps.store.load();
    if (stored) this.state = { status: 'connected', user: stored.user };
  }

  getState(): GitHubAuthState {
    return this.state;
  }

  // Checks the stored token with GitHub and refreshes the profile. A rejected token is
  // removed. A network failure keeps the connection as it is.
  async verify(): Promise<void> {
    const stored = this.deps.store.load();
    if (!stored) return;
    try {
      const user = await fetchUser(this.deps.fetch, stored.token);
      this.deps.store.save({ token: stored.token, user });
      if (this.state.status === 'connected') this.state = { status: 'connected', user };
    } catch (error) {
      if (!(error instanceof GitHubUnauthorizedError)) {
        this.deps.log.warn('Could not verify the GitHub connection', error);
        return;
      }
      this.deps.log.info('GitHub rejected the stored token. Disconnecting.');
      this.deps.store.clear();
      if (this.state.status === 'connected')
        this.state = { status: 'disconnected', error: SIGNED_OUT };
    }
  }

  // Starts the device flow and returns the pending state with the code to enter. The
  // flow finishes in the background. Returns the current flow if one is running.
  async connect(): Promise<GitHubAuthState> {
    if (this.state.status === 'pending') return this.state;
    this.flow?.abort();
    const flow = new AbortController();
    this.flow = flow;

    let code: DeviceCode;
    try {
      code = await requestDeviceCode(this.deps.fetch);
    } catch (error) {
      if (this.flow === flow) this.state = this.failure(error);
      return this.state;
    }
    if (this.flow !== flow) return this.state;

    this.state = {
      status: 'pending',
      userCode: code.userCode,
      verificationUri: code.verificationUri,
      expiresAt: new Date(Date.now() + code.expiresIn * 1000).toISOString(),
    };
    this.deps.copyText(code.userCode);
    this.deps.openUrl(code.verificationUri);
    void this.finish(flow, code);
    return this.state;
  }

  cancel(): GitHubAuthState {
    if (this.state.status !== 'pending') return this.state;
    this.flow?.abort();
    this.flow = undefined;
    this.state = { status: 'disconnected' };
    return this.state;
  }

  // Forgets the token on this computer. The authorization stays listed on GitHub until
  // the user revokes it there, since revoking needs the client secret.
  disconnect(): GitHubAuthState {
    this.flow?.abort();
    this.flow = undefined;
    this.deps.store.clear();
    this.state = { status: 'disconnected' };
    this.deps.log.info('Disconnected GitHub');
    return this.state;
  }

  private async finish(flow: AbortController, code: DeviceCode) {
    try {
      const token = await pollForToken(this.deps.fetch, this.deps.sleep, code, flow.signal);
      const user = await fetchUser(this.deps.fetch, token);
      if (this.flow !== flow) return;
      this.deps.store.save({ token, user });
      this.state = { status: 'connected', user };
      this.deps.log.info(`Connected GitHub as ${user.login}`);
    } catch (error) {
      if (this.flow === flow && !flow.signal.aborted) this.state = this.failure(error);
    } finally {
      if (this.flow === flow) this.flow = undefined;
    }
  }

  private failure(error: unknown): GitHubAuthState {
    this.deps.log.warn('GitHub connection failed', error);
    const message =
      error instanceof DeviceFlowError || error instanceof SecureStorageUnavailableError
        ? error.message
        : 'Could not reach GitHub. Check your connection and try again.';
    return { status: 'disconnected', error: message };
  }
}
