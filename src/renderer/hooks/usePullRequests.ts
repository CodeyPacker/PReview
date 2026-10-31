import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const pullRequestsKey = ['pullRequests'] as const;
const SYNCING_POLL_MS = 1000;
// The main process syncs about once a minute, so the stored list changes without a request.
const IDLE_POLL_MS = 15_000;

// The stored pull requests of the monitored repositories and the state of the sync.
export function usePullRequests() {
  return useQuery({
    queryKey: pullRequestsKey,
    queryFn: () => window.preview.pullRequests.list(),
    refetchInterval: (query) => (query.state.data?.syncing ? SYNCING_POLL_MS : IDLE_POLL_MS),
  });
}

export function useRefreshPullRequests() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.preview.pullRequests.refresh(),
    onSuccess: (state) => queryClient.setQueryData(pullRequestsKey, state),
  });
}
