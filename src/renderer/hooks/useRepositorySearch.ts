import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;

// Text search in every file of the repository at the pull request's head. It waits until the
// reviewer stops typing.
export function useRepositorySearch(
  pullRequestId: number,
  headSha: string | undefined,
  query: string,
) {
  const normalized = query.trim();
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(normalized), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [normalized]);
  const term = normalized === debounced && normalized.length >= MIN_LENGTH ? debounced : '';
  const search = useQuery({
    queryKey: ['repositorySearch', pullRequestId, headSha, term],
    enabled: headSha !== undefined && term !== '',
    queryFn: () =>
      window.preview.repositorySearch.search({
        pullRequestId,
        headSha: headSha ?? '',
        query: term,
      }),
    staleTime: Infinity,
  });
  const long = normalized.length >= MIN_LENGTH;
  return {
    result: term !== '' ? search.data : undefined,
    tooShort: normalized.length > 0 && !long,
    searching: long && (term === '' || search.isPending),
    failed: term !== '' && search.isError,
  };
}
