import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { FileReviewMark } from '../../shared/contracts/file-review-marks.ts';
import type { PullRequestChanges } from '../../shared/contracts/pull-request-files.ts';
import type { FileReviewState } from '../lib/fileReview.ts';

// File decisions kept on this machine. A decision applies while the file still has the content
// it was made on, so new commits clear only the files they change.
export function useFileReviewStates(
  pullRequestId: number,
  changes: PullRequestChanges | undefined,
) {
  const queryClient = useQueryClient();
  const queryKey = ['fileReviewMarks', pullRequestId] as const;
  const marks = useQuery({
    queryKey,
    queryFn: () => window.preview.fileReviewMarks.list(pullRequestId),
  });

  const reviewStates = useMemo(() => {
    const blobShas = new Map(changes?.files.map((file) => [file.path, file.blobSha]));
    const states: Record<string, FileReviewState> = {};
    for (const mark of marks.data ?? []) {
      if (blobShas.get(mark.path) === mark.blobSha) states[mark.path] = mark.state;
    }
    return states;
  }, [changes, marks.data]);

  function setReviewState(path: string, state: FileReviewState | undefined) {
    const blobSha = changes?.files.find((file) => file.path === path)?.blobSha;
    if (blobSha === undefined) return;
    const others = (queryClient.getQueryData<FileReviewMark[]>(queryKey) ?? []).filter(
      (mark) => mark.path !== path,
    );
    queryClient.setQueryData(queryKey, state ? [...others, { path, state, blobSha }] : others);
    window.preview.fileReviewMarks
      .set({ pullRequestId, path, state: state ?? null, blobSha })
      .then((saved) => queryClient.setQueryData(queryKey, saved))
      .catch(() => queryClient.invalidateQueries({ queryKey }));
  }

  return { reviewStates, setReviewState };
}
