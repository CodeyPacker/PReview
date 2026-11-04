import type { DatabaseSync } from 'node:sqlite';
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
import type { GitProvider, ProviderRepository } from './types.ts';

// One account's provider, which can also say what the account may do in a repository.
export type AccountProvider = GitProvider & {
  getRepository(repositoryFullName: string): Promise<ProviderRepository>;
};

export interface RoutingProviderDeps {
  db: DatabaseSync;
  // The connected logins, as GitHub spells them, in the order assignment tries them.
  logins: () => string[];
  // Makes the provider for an account. Called once per login.
  createProvider: (login: string) => AccountProvider;
}

// Sends each call with the account assigned to its repository. A repository with no
// assigned account, or whose account is gone, rejects with GitHubNotConnectedError.
export class RoutingProvider implements GitProvider {
  private readonly providers = new Map<string, AccountProvider>();

  constructor(private readonly deps: RoutingProviderDeps) {}

  // The connected account assigned to the repository, as GitHub spells the login.
  accountFor(repositoryFullName: string): string | undefined {
    const assigned = getRepositoryAccount(this.deps.db, repositoryFullName);
    if (!assigned) return undefined;
    const wanted = assigned.login.toLowerCase();
    return this.deps.logins().find((login) => login.toLowerCase() === wanted);
  }

  // Picks the account for a repository and saves it. Accounts are tried in login order. The
  // first that can push wins, otherwise the first that can read it. Rejects with
  // GitHubNoAccessError when none can read it. Rejects with an account's error when that
  // account could not answer and no account can push, so a later try can still pick it.
  async assign(repositoryFullName: string): Promise<string> {
    const logins = this.deps.logins();
    if (logins.length === 0) throw new GitHubNotConnectedError('GitHub is not connected.');
    let readable: string | undefined;
    let failure: Error | undefined;
    for (const login of logins) {
      try {
        const repository = await this.providerFor(login).getRepository(repositoryFullName);
        if (repository.canPush) return this.save(repositoryFullName, login);
        readable ??= login;
      } catch (error) {
        if (error instanceof GitHubApiError && (error.status === 403 || error.status === 404))
          continue;
        tag(error, login);
        failure ??= error instanceof Error ? error : new Error(String(error));
      }
    }
    if (failure !== undefined) throw failure;
    if (readable) return this.save(repositoryFullName, readable);
    throw new GitHubNoAccessError();
  }

  getPullRequests(r: string) {
    return this.route(r, (p) => p.getPullRequests(r));
  }
  getPullRequestRefs(r: string, number: number) {
    return this.route(r, (p) => p.getPullRequestRefs(r, number));
  }
  getPullRequestFiles(r: string, number: number) {
    return this.route(r, (p) => p.getPullRequestFiles(r, number));
  }
  getPullRequestCommits(r: string, number: number) {
    return this.route(r, (p) => p.getPullRequestCommits(r, number));
  }
  getCommitChanges(r: string, sha: string) {
    return this.route(r, (p) => p.getCommitChanges(r, sha));
  }
  getChangesBetween(r: string, baseSha: string, headSha: string) {
    return this.route(r, (p) => p.getChangesBetween(r, baseSha, headSha));
  }
  getRepositoryFiles(r: string, ref: string) {
    return this.route(r, (p) => p.getRepositoryFiles(r, ref));
  }
  getMergeBase(r: string, baseBranch: string, headSha: string) {
    return this.route(r, (p) => p.getMergeBase(r, baseBranch, headSha));
  }
  getFileContent(r: string, path: string, ref: string) {
    return this.route(r, (p) => p.getFileContent(r, path, ref));
  }
  getFileBytes(r: string, path: string, ref: string) {
    return this.route(r, (p) => p.getFileBytes(r, path, ref));
  }
  getReviewThreads(r: string, number: number) {
    return this.route(r, (p) => p.getReviewThreads(r, number));
  }
  replyToThread(r: string, threadId: string, body: string) {
    return this.route(r, (p) => p.replyToThread(r, threadId, body));
  }
  setThreadResolved(r: string, threadId: string, resolved: boolean) {
    return this.route(r, (p) => p.setThreadResolved(r, threadId, resolved));
  }
  submitReview(r: string, number: number, review: Parameters<GitProvider['submitReview']>[2]) {
    return this.route(r, (p) => p.submitReview(r, number, review));
  }
  getPullRequestDetails(r: string, number: number) {
    return this.route(r, (p) => p.getPullRequestDetails(r, number));
  }
  getChecks(r: string, number: number, sha: string) {
    return this.route(r, (p) => p.getChecks(r, number, sha));
  }
  getReviews(r: string, number: number) {
    return this.route(r, (p) => p.getReviews(r, number));
  }
  mergePullRequest(
    r: string,
    number: number,
    headSha: string,
    method: Parameters<GitProvider['mergePullRequest']>[3],
  ) {
    return this.route(r, (p) => p.mergePullRequest(r, number, headSha, method));
  }
  deleteBranch(r: string, branch: string) {
    return this.route(r, (p) => p.deleteBranch(r, branch));
  }

  private async route<T>(
    repositoryFullName: string,
    call: (provider: AccountProvider) => Promise<T>,
  ): Promise<T> {
    const login = this.accountFor(repositoryFullName);
    if (!login) {
      throw new GitHubNotConnectedError(
        'No connected GitHub account is assigned to this repository.',
      );
    }
    try {
      return await call(this.providerFor(login));
    } catch (error) {
      tag(error, login);
      throw error;
    }
  }

  private providerFor(login: string): AccountProvider {
    const key = login.toLowerCase();
    let provider = this.providers.get(key);
    if (!provider) {
      provider = this.deps.createProvider(login);
      this.providers.set(key, provider);
    }
    return provider;
  }

  private save(repositoryFullName: string, login: string): string {
    setRepositoryAccount(this.deps.db, repositoryFullName, login, false);
    return login;
  }
}

// Names the account on the errors that stop an account's syncing.
function tag(error: unknown, login: string) {
  if (error instanceof GitHubRateLimitError || error instanceof GitHubUnauthorizedError) {
    error.login = login;
  }
}
