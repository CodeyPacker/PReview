import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { PullRequestChanges } from '../../shared/contracts/pull-request-files.ts';
import type { FileReviewState } from '../lib/fileReview.ts';

const storedReviewStates = z.object({
  revision: z.string(),
  states: z.record(z.string(), z.enum(['approved', 'flagged'])),
});

// Local file decisions apply only to the exact diff revision that was reviewed.
export function useFileReviewStates(
  pullRequestId: number,
  changes: PullRequestChanges | undefined,
) {
  const queryClient = useQueryClient();
  const revision = changes ? `${changes.mergeBase}:${changes.headSha}` : undefined;
  const storageKey = `preview.fileReview.${pullRequestId}`;
  const queryKey = ['fileReview', pullRequestId, revision] as const;

  function read(): Record<string, FileReviewState> {
    if (!revision) return {};
    try {
      const saved = storedReviewStates.safeParse(
        JSON.parse(localStorage.getItem(storageKey) ?? 'null'),
      );
      return saved.success && saved.data.revision === revision ? saved.data.states : {};
    } catch {
      return {};
    }
  }

  const { data: reviewStates } = useQuery({
    queryKey,
    queryFn: read,
    initialData: read,
    staleTime: Infinity,
  });

  function setReviewState(path: string, state: FileReviewState | undefined) {
    if (!revision) return;
    const states = { ...queryClient.getQueryData<Record<string, FileReviewState>>(queryKey) };
    if (state) states[path] = state;
    else delete states[path];
    queryClient.setQueryData(queryKey, states);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ revision, states }));
    } catch {
      // Keep the in-memory decisions if local storage is unavailable.
    }
  }

  return { reviewStates, setReviewState };
}
