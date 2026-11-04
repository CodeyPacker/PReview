import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateState } from '../../shared/contracts/updates.ts';

const updatesKey = ['updates'] as const;

// Checked every few seconds, so a download's progress shows as it goes.
export function useUpdates() {
  return useQuery({
    queryKey: updatesKey,
    queryFn: () => window.preview.updates.get(),
    refetchInterval: 3000,
  });
}

export function useAppVersion() {
  return useQuery({
    queryKey: ['appInfo'],
    queryFn: () => window.preview.app.getInfo(),
    select: (info) => info.version,
    staleTime: Infinity,
  });
}

export function useCheckForUpdates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.preview.updates.check(),
    onSuccess: (state: UpdateState) => queryClient.setQueryData(updatesKey, state),
  });
}

// Restarts PReview, unless an agent is running.
export function useInstallUpdate() {
  return useMutation({ mutationFn: () => window.preview.updates.install() });
}
