import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Settings, SettingsPatch } from '../../shared/contracts/settings.ts';

const settingsKey = ['settings'] as const;

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => window.preview.settings.getAll(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => window.preview.settings.update(patch),
    onSuccess: (settings: Settings) => queryClient.setQueryData(settingsKey, settings),
  });
}
