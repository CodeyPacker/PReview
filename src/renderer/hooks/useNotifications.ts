import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationsState } from '../../shared/contracts/notifications.ts';

const notificationsKey = ['notifications'] as const;

// Checked every 30 seconds, since events arrive from the main process.
export function useNotifications() {
  return useQuery({
    queryKey: notificationsKey,
    queryFn: () => window.preview.notifications.list(),
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.preview.notifications.markAllRead(),
    onSuccess: (state: NotificationsState) => queryClient.setQueryData(notificationsKey, state),
  });
}
