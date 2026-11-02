import type { GitHubAuthState } from '../../../shared/contracts/github.ts';
import {
  SecureStorageUnavailableError,
  type CredentialStore,
  type GitHubCredentials,
} from './credential-store.ts';
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
import { GhCliError, type GhToken } from './gh-cli.ts';

export interface GitHubAuthDeps {
  store: CredentialStore;
  fetch: Fetch;
  // Reads the GitHub CLI's token, for connections made with the CLI.
  ghToken: GhToken;
  sleep: Sleep;
  // Opens GitHub's device page in the system browser.
  openUrl: (url: string) => void;
  // Copies the user code, so the user only has to paste it.
  copyText: (text: string) => void;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void };
}

const SIGNED_OUT = 'GitHub signed you out. Connect again to keep syncing pull requests.';

// Owns the GitHub connection: the device flow or the GitHub CLI, the stored credentials
// and the state the renderer reads. Holds at most one device flow at a time.
export class GitHubAuth {
  private state: GitHubAuthState = { status: 'disconnected' };
  private flow: AbortController | undefined;

  constructor(
    private readonly deps: GitHubAuthDeps,
    stored?: GitHubCredentials,
  ) {
    if (stored) this.state = { status: 'connected', source: stored.source, user: stored.user };
  }

  // Starts connected when the store holds credentials.
  static async restore(deps: GitHubAuthDeps): Promise<GitHubAuth> {
    return new GitHubAuth(deps, await deps.store.load());
  }

  getState(): GitHubAuthState {
    return this.state;
  }

  // The token for the current connection, or undefined when GitHub is not connected or
  // the GitHub CLI can't hand one out.
  async getToken(): Promise<string | undefined> {
    if (this.state.status !== 'connected') return undefined;
    const stored = await this.deps.store.load();
    if (!stored) return undefined;
    if (stored.source === 'oauth') return stored.token;
    try {
      return await this.deps.ghToken();
    } catch (error) {
      this.deps.log.warn('Could not read the GitHub CLI token', error);
      return undefined;
    }
  }

  // Checks the token with GitHub and refreshes the profile. A rejected token disconnects.
  // A network failure, or a CLI that can't hand out a token, keeps the connection.
  async verify(): Promise<void> {
    const stored = await this.deps.store.load();
    if (!stored) return;
    try {
      const token = stored.source === 'oauth' ? stored.token : await this.deps.ghToken();
      const user = await fetchUser(this.deps.fetch, token);
      await this.deps.store.save({ ...stored, user });
      if (this.state.status === 'connected') this.state = { ...this.state, user };
    } catch (error) {
      if (!(error instanceof GitHubUnauthorizedError)) {
        this.deps.log.warn('Could not verify the GitHub connection', error);
        return;
      }
      this.deps.log.info('GitHub rejected the token. Disconnecting.');
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

  // Connects with the GitHub CLI's active account. Stores only the profile, since gh
  // keeps the token. Cancels a device flow in progress.
  async connectWithCli(): Promise<GitHubAuthState> {
    this.flow?.abort();
    this.flow = undefined;
    try {
      const user = await fetchUser(this.deps.fetch, await this.deps.ghToken());
      await this.deps.store.save({ source: 'cli', user });
      this.state = { status: 'connected', source: 'cli', user };
      this.deps.log.info(`Connected GitHub through the CLI as ${user.login}`);
    } catch (error) {
      this.state = this.failure(
        error instanceof GitHubUnauthorizedError
          ? new GhCliError('GitHub rejected the GitHub CLI’s token. Run gh auth login again.')
          : error,
      );
    }
    return this.state;
  }

  cancel(): GitHubAuthState {
    if (this.state.status !== 'pending') return this.state;
    this.flow?.abort();
    this.flow = undefined;
    this.state = { status: 'disconnected' };
    return this.state;
  }

  // Forgets the credentials on this computer. An OAuth authorization stays listed on
  // GitHub until the user revokes it there, since revoking needs the client secret. A
  // CLI connection leaves gh signed in.
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
      await this.deps.store.save({ source: 'oauth', token, user });
      this.state = { status: 'connected', source: 'oauth', user };
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
      error instanceof DeviceFlowError ||
      error instanceof SecureStorageUnavailableError ||
      error instanceof GhCliError
        ? error.message
        : 'Could not reach GitHub. Check your connection and try again.';
    return { status: 'disconnected', error: message };
  }
}
