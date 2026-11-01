import { useQuery } from '@tanstack/react-query';

// A pull request's published review threads, read from GitHub. The head commit of the diff
// on show is in the key, so a push reads them again with the new lines.
export function useReviewThreads(pullRequestId: number, headSha: string | undefined) {
  return useQuery({
    queryKey: ['reviewThreads', pullRequestId, headSha],
    queryFn: () => window.preview.pullRequestReviews.listThreads(pullRequestId),
    enabled: headSha !== undefined,
  });
}
