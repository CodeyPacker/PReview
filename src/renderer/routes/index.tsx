import { createFileRoute, redirect } from '@tanstack/react-router';

// The app starts here. It opens the review that was on show when the app last closed.
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
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
