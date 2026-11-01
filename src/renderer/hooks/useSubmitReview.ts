import { useMutation } from '@tanstack/react-query';
import type { SubmitReviewInput } from '../../shared/contracts/pull-request-reviews.ts';

// Publishes a review to GitHub. The result says whether GitHub accepted it, and why not.
export function useSubmitReview() {
  return useMutation({
    mutationFn: (review: SubmitReviewInput) => window.preview.pullRequestReviews.submit(review),
  });
}
