import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubmitReviewInput } from '../../shared/contracts/pull-request-reviews.ts';

// Publishes a review to GitHub. The result says whether GitHub accepted it, and why not.
// Published drafts are deleted and become threads, so both are read again.
export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (review: SubmitReviewInput) => window.preview.pullRequestReviews.submit(review),
    onSettled: (_result, _error, review) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviewDrafts', review.pullRequestId] }),
        queryClient.invalidateQueries({ queryKey: ['reviewThreads', review.pullRequestId] }),
      ]),
  });
}
