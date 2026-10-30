import { QueryClient } from '@tanstack/react-query';

// Queries read local data over IPC, not the network, so a failure won't fix itself on
// retry and refocusing the window doesn't make data stale. Mutations update the cache.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
  },
});
