import { useMutation } from '@tanstack/react-query';
import type { DeleteBranchInput } from '../../shared/contracts/pull-request-reviews.ts';

// Deletes a pull request's branch on GitHub. The result says whether GitHub deleted it, and why not.
export function useDeleteBranch() {
  return useMutation({
    mutationFn: (branch: DeleteBranchInput) =>
      window.preview.pullRequestReviews.deleteBranch(branch),
  });
}
