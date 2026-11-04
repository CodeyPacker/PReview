import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GitHubAuthState } from '../../shared/contracts/github.ts';

const githubAuthKey = ['github', 'auth'] as const;

// The connected GitHub accounts. Polls once a second while the user is entering a code, since
// the main process finishes the device flow in the background.
export function useGitHubAuth() {
  return useQuery({
    queryKey: githubAuthKey,
    queryFn: () => window.preview.github.getAuth(),
    refetchInterval: (query) => (query.state.data?.pending ? 1000 : false),
  });
}

// Accounts decide which repositories are assigned, so the repository list is read again.
function useGitHubAction<V = void>(action: (variables: V) => Promise<GitHubAuthState>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (state) => {
      queryClient.setQueryData(githubAuthKey, state);
      return queryClient.invalidateQueries({ queryKey: ['repositories'] });
    },
  });
}

export const useConnectGitHub = () => useGitHubAction(() => window.preview.github.connect());
export const useConnectGitHubCli = () =>
  useGitHubAction(() => window.preview.github.connectWithCli());
export const useCancelGitHub = () => useGitHubAction(() => window.preview.github.cancel());
export const useDisconnectGitHub = () =>
  useGitHubAction((login: string) => window.preview.github.disconnect(login));

// The connected account with this login, in any case.
export function findAccount(auth: GitHubAuthState | undefined, login: string | undefined) {
  if (!auth || !login) return undefined;
  const wanted = login.toLowerCase();
  return auth.accounts.find((account) => account.login.toLowerCase() === wanted);
}
