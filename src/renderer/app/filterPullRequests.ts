import type { PullRequest } from '../../shared/contracts/pull-requests.ts';

export interface PullRequestFilter {
  search: string;
  // Undefined keeps every repository.
  repositoryId: number | undefined;
}

// Matches the search against the title, number, author and repository name.
export function filterPullRequests(
  pullRequests: readonly PullRequest[],
  repositoryNames: ReadonlyMap<number, string>,
  { search, repositoryId }: PullRequestFilter,
): PullRequest[] {
  const query = search.trim().toLowerCase();
  return pullRequests.filter((pull) => {
    if (repositoryId !== undefined && pull.repositoryId !== repositoryId) return false;
    if (!query) return true;
    return [
      pull.title,
      `#${pull.number}`,
      pull.author?.login,
      repositoryNames.get(pull.repositoryId),
    ]
      .filter((text) => text !== undefined)
      .some((text) => text.toLowerCase().includes(query));
  });
}
