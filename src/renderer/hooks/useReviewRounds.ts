import { useQuery, useQueryClient } from '@tanstack/react-query';

// The pull request's review rounds, oldest first. headSha is the head on show. Reading with a
// head past the last submitted review starts the next round and drops the drafts the last one
// left, so those are read again.
export function useReviewRounds(pullRequestId: number, headSha: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['reviewRounds', pullRequestId, headSha],
    queryFn: async () => {
      const rounds = await window.preview.reviewRounds.sync(pullRequestId, headSha ?? '');
      await queryClient.invalidateQueries({ queryKey: ['reviewDrafts', pullRequestId] });
      return rounds;
    },
    enabled: headSha !== undefined,
  });
}
