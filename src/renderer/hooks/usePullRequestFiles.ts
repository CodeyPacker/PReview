import { useQuery } from '@tanstack/react-query';
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

// One file before and after the pull request, at the commits the list returned. Loaded when
// the file is selected.
export function usePullRequestFileDiff(
  pullRequestId: number,
  changes: PullRequestChanges | undefined,
  path: string | undefined,
  previousPath: string | null,
) {
  const { headSha, mergeBase } = changes ?? {};
  return useQuery({
    queryKey: ['pullRequestFileDiff', pullRequestId, headSha, mergeBase, path, previousPath],
    queryFn: () =>
      window.preview.pullRequestFiles.getDiff(
        pullRequestId,
        headSha ?? '',
        mergeBase ?? '',
        path ?? '',
        previousPath,
      ),
    enabled: headSha !== undefined && mergeBase !== undefined && path !== undefined,
    // The key holds both commits, and a commit's files never change.
    staleTime: Infinity,
  });
}
