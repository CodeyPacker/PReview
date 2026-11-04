import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

// The pull request's review waiting for GitHub to be reachable. Null when none is. While one
// waits it is checked every 15 seconds. Once it is sent or dropped, the drafts, findings,
// threads and rounds it changed are read again.
export function useQueuedReview(pullRequestId: number) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['queuedReview', pullRequestId],
    queryFn: () => window.preview.pullRequestReviews.getQueued(pullRequestId),
    refetchInterval: (current) => (current.state.data ? 15_000 : false),
  });
  const waited = useRef(false);
  const waiting = Boolean(query.data);
  useEffect(() => {
    if (waited.current && !waiting) {
      for (const key of ['reviewDrafts', 'reviewFindings', 'reviewThreads', 'reviewRounds']) {
        void queryClient.invalidateQueries({ queryKey: [key, pullRequestId] });
      }
    }
    waited.current = waiting;
  }, [waiting, pullRequestId, queryClient]);
  return query;
}
