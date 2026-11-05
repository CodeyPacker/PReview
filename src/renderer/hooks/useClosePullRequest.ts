import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClosePullRequestInput } from '../../shared/contracts/pull-request-reviews.ts';

// Closes a pull request on GitHub. The result says whether GitHub closed it, and why not.
export function useClosePullRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (close: ClosePullRequestInput) => window.preview.pullRequestReviews.close(close),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pullRequests'] }),
  });
}
