import { useQuery } from '@tanstack/react-query';

// The files a pull request changes. Loaded when a review opens, not with the Inbox sync.
export function usePullRequestFiles(pullRequestId: number, headSha: string | undefined) {
  return useQuery({
    queryKey: ['pullRequestFiles', pullRequestId, headSha],
    enabled: headSha !== undefined,
    queryFn: () => window.preview.pullRequestFiles.list(pullRequestId),
  });
}

// One file before and after the pull request. Loaded when the file is selected.
export function usePullRequestFileDiff(
  pullRequestId: number,
  headSha: string | undefined,
  path: string | undefined,
  previousPath: string | null,
) {
  return useQuery({
    queryKey: ['pullRequestFileDiff', pullRequestId, headSha, path, previousPath],
    queryFn: () => window.preview.pullRequestFiles.getDiff(pullRequestId, path ?? '', previousPath),
    enabled: path !== undefined && headSha !== undefined,
    // The key holds the head commit, and a commit's files never change.
    staleTime: Infinity,
  });
}
