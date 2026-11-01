import { queryOptions, useQuery } from '@tanstack/react-query';
import type { PullRequestChanges } from '../../shared/contracts/pull-request-files.ts';

// The files a pull request changes, read from GitHub when a review opens. The synced head
// commit and base branch are in the key, so a push or a retarget reads the list again.
export function usePullRequestFiles(
  pullRequestId: number,
  syncedHeadSha: string | undefined,
  syncedBaseBranch: string | undefined,
) {
  return useQuery({
    queryKey: ['pullRequestFiles', pullRequestId, syncedHeadSha, syncedBaseBranch],
    queryFn: () => window.preview.pullRequestFiles.list(pullRequestId),
    enabled: syncedHeadSha !== undefined,
  });
}

// Shared by the selected file and text search so each immutable diff is loaded once.
export function pullRequestFileDiffOptions(
  pullRequestId: number,
  headSha: string,
  mergeBase: string,
  path: string,
  previousPath: string | null,
) {
  return queryOptions({
    queryKey: ['pullRequestFileDiff', pullRequestId, headSha, mergeBase, path, previousPath],
    queryFn: () =>
      window.preview.pullRequestFiles.getDiff(
        pullRequestId,
        headSha,
        mergeBase,
        path,
        previousPath,
      ),
    staleTime: Infinity,
  });
}

// One file before and after the pull request, at the commits the list returned.
export function usePullRequestFileDiff(
  pullRequestId: number,
  changes: PullRequestChanges | undefined,
  path: string | undefined,
  previousPath: string | null,
) {
  return useQuery({
    ...pullRequestFileDiffOptions(
      pullRequestId,
      changes?.headSha ?? '',
      changes?.mergeBase ?? '',
      path ?? '',
      previousPath,
    ),
    enabled: changes !== undefined && path !== undefined,
  });
}
