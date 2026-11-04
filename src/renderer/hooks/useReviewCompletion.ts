import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Whether the reviewer finished this pull request's review. Finishing is local and doesn't
// touch GitHub. It also finishes the latest round, so the rounds are read again, and the
// first finish awards XP.
export function useReviewCompletion(pullRequestId: number) {
  const queryClient = useQueryClient();
  const queryKey = ['reviewCompletion', pullRequestId] as const;
  const completion = useQuery({
    queryKey,
    queryFn: () => window.preview.reviewCompletions.get(pullRequestId),
  });
  const finish = useMutation({
    mutationFn: () => window.preview.reviewCompletions.finish(pullRequestId),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviewRounds', pullRequestId] }),
        queryClient.invalidateQueries({ queryKey: ['pullRequests'] }),
        queryClient.invalidateQueries({ queryKey: ['progression'] }),
      ]);
    },
  });
  return { completion, finish };
}
