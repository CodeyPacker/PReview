import type { GitHubAuthSource, GitHubUser } from '../../../shared/contracts/github.ts';
import type { CredentialStore, GitHubCredentials } from './credential-store.ts';
import { fetchUser, GitHubUnauthorizedError, type Fetch } from './device-flow.ts';
import type { GhToken } from './gh-cli.ts';

export interface GitHubAccountDeps {
  fetch: Fetch;
  // Reads the GitHub CLI's token, for accounts connected with the CLI.
  ghToken: GhToken;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void };
}

// One connected GitHub account and its stored credentials.
export class GitHubAccount {
  constructor(
    private readonly deps: GitHubAccountDeps,
    private readonly store: CredentialStore,
    private credentials: GitHubCredentials,
  ) {}

  // The login as GitHub spells it.
  get login(): string {
    return this.credentials.user.login;
  }

  get user(): GitHubUser {
    return this.credentials.user;
  }

  get source(): GitHubAuthSource {
    return this.credentials.source;
  }

  // The account's token, or undefined when the GitHub CLI can't hand one out. A CLI account
  // asks gh for this login's token, not the active account's.
  async getToken(): Promise<string | undefined> {
    if (this.credentials.source === 'oauth') return this.credentials.token;
    try {
      return await this.deps.ghToken(this.login);
    } catch (error) {
      this.deps.log.warn(`Could not read the GitHub CLI token for ${this.login}`, error);
      return undefined;
    }
  }

  // Checks the token with GitHub and refreshes the name and avatar. The login stays as
  // stored, since it names the credential file and the repositories assigned to the account.
  // Resolves false when GitHub rejected the token. A network failure, or a CLI that can't
  // hand out a token, keeps the account.
  async verify(): Promise<boolean> {
    try {
      const token =
        this.credentials.source === 'oauth'
          ? this.credentials.token
          : await this.deps.ghToken(this.login);
      const user = await fetchUser(this.deps.fetch, token);
      this.credentials = { ...this.credentials, user: { ...user, login: this.login } };
      await this.store.save(this.credentials);
      return true;
    } catch (error) {
      if (error instanceof GitHubUnauthorizedError) return false;
      this.deps.log.warn(`Could not verify the GitHub account ${this.login}`, error);
      return true;
    }
  }

  // Forgets the credentials on this computer.
  forget(): void {
    this.store.clear();
  }
}
