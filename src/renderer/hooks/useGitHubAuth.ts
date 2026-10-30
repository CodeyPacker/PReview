import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GitHubAuthState } from '../../shared/contracts/github.ts';

const githubAuthKey = ['github', 'auth'] as const;

// The GitHub connection. Polls once a second while the user is entering a code, since the
// main process finishes the device flow in the background.
export function useGitHubAuth() {
  return useQuery({
    queryKey: githubAuthKey,
    queryFn: () => window.preview.github.getAuth(),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 1000 : false),
  });
}

function useGitHubAction(action: () => Promise<GitHubAuthState>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (state) => queryClient.setQueryData(githubAuthKey, state),
  });
}

export const useConnectGitHub = () => useGitHubAction(() => window.preview.github.connect());
export const useCancelGitHub = () => useGitHubAction(() => window.preview.github.cancel());
export const useDisconnectGitHub = () => useGitHubAction(() => window.preview.github.disconnect());
