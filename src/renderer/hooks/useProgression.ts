import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CharacterId } from '../../shared/contracts/progression.ts';

// Account and character levels. Anything that may award XP invalidates ['progression'].
export function useProgression() {
  const queryClient = useQueryClient();
  const queryKey = ['progression'] as const;
  const progression = useQuery({
    queryKey,
    queryFn: () => window.preview.progression.get(),
  });
  const setActiveCharacter = useMutation({
    mutationFn: (characterId: CharacterId) =>
      window.preview.progression.setActiveCharacter(characterId),
    onSuccess: (saved) => queryClient.setQueryData(queryKey, saved),
  });
  return { progression, setActiveCharacter };
}
