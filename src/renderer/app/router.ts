import { createHashHistory, createRouter } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen.ts';

// Hash history, because the packaged app loads index.html from disk (file://).
export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
