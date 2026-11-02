import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import type { ReviewSession } from '../../shared/contracts/review-sessions.ts';

// How long changes wait before they are written, so scrolling writes once it stops.
const SAVE_DELAY_MS = 500;

export type ReviewSessionChange = Partial<Omit<ReviewSession, 'pullRequestId'>>;

// Where the reviewer left off in a pull request. While the review is on show it is the active
// one, so the app opens it again after a restart.
export function useReviewSession(pullRequestId: number) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['reviewSession', pullRequestId],
    queryFn: () => window.preview.reviewSessions.get(pullRequestId),
  });
  const pending = useRef<ReviewSession>(undefined);
  const timer = useRef<number>(undefined);

  // Kept out of the cache until written, so scrolling doesn't render the page again.
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    pending.current = undefined;
    if (!next) return;
    queryClient.setQueryData(['reviewSession', next.pullRequestId], next);
    // A failed save loses the position, not the review.
    window.preview.reviewSessions.save(next).catch(() => undefined);
  }, [queryClient]);

  function save(change: ReviewSessionChange) {
    const saved = queryClient.getQueryData<ReviewSession | null>(['reviewSession', pullRequestId]);
    pending.current = {
      pullRequestId,
      selectedPath: null,
      scrollTop: 0,
      diffMode: 'split',
      ...saved,
      ...pending.current,
      ...change,
    };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  }

  useEffect(() => {
    void window.preview.reviewSessions.setActive(pullRequestId);
    return () => {
      flush();
      void window.preview.reviewSessions.setActive(null);
    };
  }, [pullRequestId, flush]);

  return { session, save };
}
