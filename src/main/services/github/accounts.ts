import type { GitHubAuthState } from '../../../shared/contracts/github.ts';
import { GitHubAccount } from './account.ts';
import {
  SecureStorageUnavailableError,
  type CredentialDirectory,
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

export interface GitHubAccountsDeps {
  directory: CredentialDirectory;
  fetch: Fetch;
  // Reads the GitHub CLI's token, for accounts connected with the CLI.
  ghToken: GhToken;
  sleep: Sleep;
  // Opens GitHub's device page in the system browser.
  openUrl: (url: string) => void;
  // Copies the user code, so the user only has to paste it.
  copyText: (text: string) => void;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void };
}

interface Pending {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
}

export interface GitHubAccountsListener {
  // An account was connected, or its credentials replaced.
  added?(login: string): void;
  // An account was disconnected, or GitHub rejected its token.
  removed?(login: string): void;
}

const SIGNED_OUT = 'GitHub signed you out. Connect again to keep syncing pull requests.';

const key = (login: string) => login.toLowerCase();

// Owns every connected GitHub account and the one device flow that can run at a time. The
// device flow lives here, not on an account, because the login is only known once it ends.
export class GitHubAccounts {
  private readonly accounts = new Map<string, GitHubAccount>();
  private readonly listeners: GitHubAccountsListener[] = [];
  private pending: Pending | undefined;
  private connected: GitHubAuthState['connected'];
  private error: string | undefined;
  private flow: AbortController | undefined;

  constructor(private readonly deps: GitHubAccountsDeps) {}

  // Loads every account with stored credentials.
  static async restore(deps: GitHubAccountsDeps): Promise<GitHubAccounts> {
    const accounts = new GitHubAccounts(deps);
    for (const login of deps.directory.logins()) {
      const store = deps.directory.store(login);
      const stored = await store.load();
      if (stored) accounts.put(stored);
    }
    return accounts;
  }

  listen(listener: GitHubAccountsListener): void {
    this.listeners.push(listener);
  }

  // Connected accounts in login order, ignoring case.
  list(): GitHubAccount[] {
    return [...this.accounts.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, account]) => account);
  }

  // The connected account with this login, in any case.
  get(login: string): GitHubAccount | undefined {
    return this.accounts.get(key(login));
  }

  // The state the renderer reads. Never includes a token.
  getState(): GitHubAuthState {
    return {
      accounts: this.list().map((account) => ({ ...account.user, source: account.source })),
      ...(this.pending && { pending: this.pending }),
      ...(this.connected && { connected: this.connected }),
      ...(this.error && { error: this.error }),
    };
  }

  // Checks every account with GitHub. An account whose token GitHub rejects is forgotten.
  async verify(): Promise<void> {
    for (const account of this.list()) {
      if (await account.verify()) continue;
      this.deps.log.info(`GitHub rejected the token for ${account.login}. Disconnecting it.`);
      this.error = SIGNED_OUT;
      this.remove(account);
    }
  }

  // Starts the device flow and returns the pending state with the code to enter. The flow
  // finishes in the background. Returns the current flow if one is running.
  async connect(): Promise<GitHubAuthState> {
    if (this.pending) return this.getState();
    this.flow?.abort();
    const flow = new AbortController();
    this.flow = flow;
    this.error = undefined;
    this.connected = undefined;

    let code: DeviceCode;
    try {
      code = await requestDeviceCode(this.deps.fetch);
    } catch (error) {
      if (this.flow === flow) this.fail(error);
      return this.getState();
    }
    if (this.flow !== flow) return this.getState();

    this.pending = {
      userCode: code.userCode,
      verificationUri: code.verificationUri,
      expiresAt: new Date(Date.now() + code.expiresIn * 1000).toISOString(),
    };
    this.deps.copyText(code.userCode);
    this.deps.openUrl(code.verificationUri);
    void this.finish(flow, code);
    return this.getState();
  }

  // Connects the GitHub CLI's active account. Stores only the profile, since gh keeps the
  // token. Cancels a device flow in progress.
  async connectWithCli(): Promise<GitHubAuthState> {
    this.stopFlow();
    this.error = undefined;
    this.connected = undefined;
    try {
      const user = await fetchUser(this.deps.fetch, await this.deps.ghToken());
      await this.add({ source: 'cli', user });
      this.deps.log.info(`Connected GitHub through the CLI as ${user.login}`);
    } catch (error) {
      this.fail(
        error instanceof GitHubUnauthorizedError
          ? new GhCliError('GitHub rejected the GitHub CLI’s token. Run gh auth login again.')
          : error,
      );
    }
    return this.getState();
  }

  cancel(): GitHubAuthState {
    if (this.pending) this.stopFlow();
    return this.getState();
  }

  // Forgets an account's credentials on this computer. An OAuth authorization stays listed on
  // GitHub until the user revokes it there, since revoking needs the client secret. A CLI
  // account leaves gh signed in.
  disconnect(login: string): GitHubAuthState {
    this.stopFlow();
    this.error = undefined;
    this.connected = undefined;
    const account = this.get(login);
    if (account) {
      this.remove(account);
      this.deps.log.info(`Disconnected GitHub account ${account.login}`);
    }
    return this.getState();
  }

  private async finish(flow: AbortController, code: DeviceCode) {
    try {
      const token = await pollForToken(this.deps.fetch, this.deps.sleep, code, flow.signal);
      const user = await fetchUser(this.deps.fetch, token);
      if (this.flow !== flow) return;
      await this.add({ source: 'oauth', token, user });
      this.deps.log.info(`Connected GitHub as ${user.login}`);
    } catch (error) {
      if (this.flow === flow && !flow.signal.aborted) this.fail(error);
    } finally {
      if (this.flow === flow) {
        this.flow = undefined;
        this.pending = undefined;
      }
    }
  }

  // Saves the credentials and connects the account, replacing one with the same login.
  private async add(credentials: GitHubCredentials) {
    await this.deps.directory.store(credentials.user.login).save(credentials);
    const replaced = this.accounts.has(key(credentials.user.login));
    const account = this.put(credentials);
    this.connected = { login: account.login, replaced };
    for (const listener of this.listeners) listener.added?.(account.login);
  }

  private put(credentials: GitHubCredentials): GitHubAccount {
    const { login } = credentials.user;
    const account = new GitHubAccount(this.deps, this.deps.directory.store(login), credentials);
    this.accounts.set(key(login), account);
    return account;
  }

  private remove(account: GitHubAccount) {
    account.forget();
    this.accounts.delete(key(account.login));
    for (const listener of this.listeners) listener.removed?.(account.login);
  }

  private stopFlow() {
    this.flow?.abort();
    this.flow = undefined;
    this.pending = undefined;
  }

  private fail(error: unknown) {
    this.deps.log.warn('GitHub connection failed', error);
    this.pending = undefined;
    this.error =
      error instanceof DeviceFlowError ||
      error instanceof SecureStorageUnavailableError ||
      error instanceof GhCliError
        ? error.message
        : 'Could not reach GitHub. Check your connection and try again.';
  }
}
