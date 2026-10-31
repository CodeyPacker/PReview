// The provider interface the rest of the app talks to. GitHub is the only adapter in the MVP.
// Read operations only. Write operations (reviews, replies, thread resolution, merge) are added
// when the features that need them are built.

export type ProviderName = 'github';

export interface ProviderRepository {
  provider: ProviderName;
  // The provider's own identifier.
  providerId: string;
  // owner/name. Pass it to getPullRequests.
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  // Whether the signed-in user can push, which merging needs.
  canPush: boolean;
}

export interface ProviderPullRequest {
  provider: ProviderName;
  // The provider's own identifier.
  providerId: string;
  number: number;
  title: string;
  draft: boolean;
  url: string;
  // bot is true for GitHub Apps and other automated accounts.
  author: { login: string; avatarUrl: string; bot: boolean } | null;
  headBranch: string;
  headSha: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
}

export type ChangedFileStatus = 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed';

export interface ProviderChangedFile {
  path: string;
  // The path before a rename or copy.
  previousPath: string | null;
  status: ChangedFileStatus;
  additions: number;
  deletions: number;
}

export interface GitProvider {
  // Repositories the signed-in user can read.
  getRepositories(): Promise<ProviderRepository[]>;
  // Open pull requests whose branch is in the same repository. Fork-origin pull requests are
  // left out, because the MVP does not review them.
  getPullRequests(repositoryFullName: string): Promise<ProviderPullRequest[]>;
  // The files a pull request changes, in the order the provider lists them.
  getPullRequestFiles(repositoryFullName: string, number: number): Promise<ProviderChangedFile[]>;
  // The commit the pull request branched from, which its diff is taken against.
  getMergeBase(repositoryFullName: string, baseBranch: string, headSha: string): Promise<string>;
  // A file's text at a commit. undefined when the file does not exist there.
  getFileContent(
    repositoryFullName: string,
    path: string,
    ref: string,
  ): Promise<string | undefined>;
}
