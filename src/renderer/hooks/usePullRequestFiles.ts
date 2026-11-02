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

// The pull request's commits. The head commit is in the key, so a push reads them again.
export function usePullRequestCommits(pullRequestId: number, headSha: string | undefined) {
  return useQuery({
    queryKey: ['pullRequestCommits', pullRequestId, headSha],
    queryFn: () => window.preview.pullRequestFiles.listCommits(pullRequestId),
    enabled: headSha !== undefined,
  });
}

// The files one commit changes. A commit never changes, so it is read once.
export function usePullRequestCommitFiles(pullRequestId: number, sha: string | undefined) {
  return useQuery({
    queryKey: ['pullRequestCommitFiles', pullRequestId, sha],
    queryFn: () => window.preview.pullRequestFiles.listCommit(pullRequestId, sha ?? ''),
    enabled: sha !== undefined,
    staleTime: Infinity,
  });
}

// The files that changed since the last submitted review. Both commits are in the key, so it
// never changes.
export function usePullRequestChangesSince(
  pullRequestId: number,
  baselineSha: string | undefined,
  headSha: string | undefined,
) {
  return useQuery({
    queryKey: ['pullRequestChangesSince', pullRequestId, baselineSha, headSha],
    queryFn: () =>
      window.preview.pullRequestFiles.listSince(pullRequestId, baselineSha ?? '', headSha ?? ''),
    enabled: baselineSha !== undefined && headSha !== undefined,
    staleTime: Infinity,
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

// Every file of the repository at the head, read when the reviewer browses it.
export function useRepositoryFiles(
  pullRequestId: number,
  headSha: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['repositoryFiles', pullRequestId, headSha],
    queryFn: () =>
      window.preview.pullRequestFiles.listRepositoryFiles(pullRequestId, headSha ?? ''),
    enabled: enabled && headSha !== undefined,
    staleTime: Infinity,
  });
}
