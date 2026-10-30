import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WatchedFolder } from '../../shared/contracts/repositories.ts';

const foldersKey = ['folders'] as const;
const repositoriesKey = ['repositories'] as const;

export function useWatchedFolders() {
  return useQuery({
    queryKey: foldersKey,
    queryFn: () => window.preview.folders.list(),
  });
}

// The discovered repositories. Polls once a second during a scan, since the main process
// scans in the background.
export function useRepositories() {
  return useQuery({
    queryKey: repositoriesKey,
    queryFn: () => window.preview.repositories.list(),
    refetchInterval: (query) => (query.state.data?.scanning ? 1000 : false),
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
