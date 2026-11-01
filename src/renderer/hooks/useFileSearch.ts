import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PullRequestChanges } from '../../shared/contracts/pull-request-files.ts';
import { searchChangedFiles, type FileSearchMatch } from '../lib/fileSearch.ts';
import { pullRequestFileDiffOptions } from './usePullRequestFiles.ts';

const noMatches: ReadonlyMap<string, FileSearchMatch> = new Map();

export function useFileSearch(
  pullRequestId: number,
  changes: PullRequestChanges | undefined,
  query: string,
) {
  const queryClient = useQueryClient();
  const normalized = query.trim().toLowerCase();
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(normalized), 200);
    return () => window.clearTimeout(timer);
  }, [normalized]);
  const term = normalized === debounced ? debounced : '';
  const result = useQuery({
    queryKey: ['fileSearch', pullRequestId, changes?.headSha, changes?.mergeBase, term],
    enabled: changes !== undefined && term !== '',
    queryFn: ({ signal }) =>
      searchChangedFiles(
        changes?.files ?? [],
        term,
        (file) =>
          queryClient.ensureQueryData(
            pullRequestFileDiffOptions(
              pullRequestId,
              changes?.headSha ?? '',
              changes?.mergeBase ?? '',
              file.path,
              file.previousPath,
            ),
          ),
        signal,
      ),
    staleTime: Infinity,
  });
  const current = term !== '' && term === normalized;
  return {
    matches: current ? (result.data?.matches ?? noMatches) : noMatches,
    searching: normalized !== '' && (!current || result.isPending),
    failed: current ? (result.data?.failed ?? 0) : 0,
    skipped: current ? (result.data?.skipped ?? 0) : 0,
  };
}
