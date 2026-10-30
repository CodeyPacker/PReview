import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient.ts';
import { ThemeSync } from './ThemeSync.tsx';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <h1>PReview</h1>
    </QueryClientProvider>
  );
}
