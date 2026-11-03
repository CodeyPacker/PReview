import { useQuery } from '@tanstack/react-query';

// The saved summary of a pull request the reviewer merged. Null when it wasn't merged here.
export function useMergedPullRequest(pullRequestId: number) {
  return useQuery({
    queryKey: ['mergedPullRequest', pullRequestId],
    queryFn: () => window.preview.mergedPullRequests.get(pullRequestId),
  });
}
