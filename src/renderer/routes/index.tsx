import { createFileRoute, redirect } from '@tanstack/react-router';

// The app starts here, on the screen chosen in Settings. By default that is the review on show
// when the app last closed, or the Dashboard without one.
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const settings = await window.preview.settings.getAll().catch(() => null);
    if (settings?.startupScreen === 'inbox') throw redirect({ to: '/inbox' });
    if (settings?.startupScreen === 'dashboard') throw redirect({ to: '/dashboard' });
    const pullRequestId = await window.preview.reviewSessions.getActive().catch(() => null);
    if (pullRequestId !== null) {
      throw redirect({
        to: '/review/$pullRequestId',
        params: { pullRequestId: String(pullRequestId) },
      });
    }
    throw redirect({ to: '/dashboard' });
  },
});
