import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RepositorySettingsPatch,
  WatchedFolder,
} from '../../shared/contracts/repositories.ts';

const foldersKey = ['folders'] as const;
const repositoriesKey = ['repositories'] as const;

export function useWatchedFolders() {
  return useQuery({
    queryKey: foldersKey,
    queryFn: () => window.preview.folders.list(),
  });
}

// The discovered repositories. Polls once a second during a scan, since the main process
// scans in the background. Polls more slowly while a monitored repository waits for the sync
// to assign it a GitHub account.
export function useRepositories() {
  return useQuery({
    queryKey: repositoriesKey,
    queryFn: () => window.preview.repositories.list(),
    refetchInterval: (query) => {
      const state = query.state.data;
      if (state?.scanning) return 1000;
      const unassigned = state?.repositories.some(
        (repository) =>
          repository.github &&
          !repository.account &&
          repository.status === 'available' &&
          repository.settings.monitored,
      );
      return unassigned ? 5000 : false;
    },
  });
}

// Changing a watched folder starts a scan, so the repository list is read again.
function useFolderAction<V>(action: (variables: V) => Promise<WatchedFolder[]>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (folders) => {
      queryClient.setQueryData(foldersKey, folders);
      return queryClient.invalidateQueries({ queryKey: repositoriesKey });
    },
  });
}

export const useAddFolder = () => useFolderAction(() => window.preview.folders.add());
export const useRemoveFolder = () =>
  useFolderAction((id: number) => window.preview.folders.remove(id));
export const useSetScanDepth = () =>
  useFolderAction((change: { id: number; scanDepth: number }) =>
    window.preview.folders.setScanDepth(change.id, change.scanDepth),
  );

export function useRescan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.preview.repositories.scan(),
    onSuccess: (state) => queryClient.setQueryData(repositoriesKey, state),
  });
}

export function useSetRepositoryAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: { id: number; login: string | null }) =>
      window.preview.repositories.setAccount(change.id, change.login),
    onSuccess: (state) => queryClient.setQueryData(repositoriesKey, state),
  });
}

export function useUpdateRepositorySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: { id: number; patch: RepositorySettingsPatch }) =>
      window.preview.repositories.updateSettings(change.id, change.patch),
    onSuccess: (state) => queryClient.setQueryData(repositoriesKey, state),
  });
}
