import { useMutation } from '@tanstack/react-query';
import type { MergePullRequestInput } from '../../shared/contracts/pull-request-reviews.ts';

// Merges a pull request on GitHub. The result says whether GitHub merged it, and why not.
export function useMergePullRequest() {
  return useMutation({
    mutationFn: (merge: MergePullRequestInput) => window.preview.pullRequestReviews.merge(merge),
  });
}
