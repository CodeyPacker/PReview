import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from './queryClient.ts';
import { router } from './router.ts';
import { AppearanceSync } from './AppearanceSync.tsx';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppearanceSync />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
