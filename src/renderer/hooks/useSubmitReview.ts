import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubmitReviewInput } from '../../shared/contracts/pull-request-reviews.ts';

// Publishes a review to GitHub. The result says whether GitHub accepted it, why not, or that
// it was queued because GitHub couldn't be reached.
// Published drafts are deleted and become threads, and published findings are marked, so all
// three are read again, along with the rounds, because the submitted one ends.
export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (review: SubmitReviewInput) => window.preview.pullRequestReviews.submit(review),
    onSettled: (_result, _error, review) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviewDrafts', review.pullRequestId] }),
        queryClient.invalidateQueries({ queryKey: ['reviewThreads', review.pullRequestId] }),
        queryClient.invalidateQueries({ queryKey: ['reviewFindings', review.pullRequestId] }),
        queryClient.invalidateQueries({ queryKey: ['reviewRounds', review.pullRequestId] }),
        queryClient.invalidateQueries({ queryKey: ['queuedReview', review.pullRequestId] }),
        queryClient.invalidateQueries({ queryKey: ['pullRequests'] }),
      ]),
  });
}
