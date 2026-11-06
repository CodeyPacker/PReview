import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useClearReviewData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.preview.reviewData.clear(),
    // Drafts, findings and agent tasks are cached across many screens.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
