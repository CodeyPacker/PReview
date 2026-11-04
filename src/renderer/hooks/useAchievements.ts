import { useQuery } from '@tanstack/react-query';

// Every achievement with its progress. XP awards can earn them, so they're read with
// ['progression'] and invalidated along with it.
export function useAchievements() {
  return useQuery({
    queryKey: ['progression', 'achievements'],
    queryFn: () => window.preview.achievements.list(),
  });
}
