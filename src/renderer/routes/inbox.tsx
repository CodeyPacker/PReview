import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../app/PageHeader.tsx';

export const Route = createFileRoute('/inbox')({ component: InboxPage });

function InboxPage() {
  return (
    <PageHeader
      title="Inbox"
      description="Review pull requests, track progress, and collaborate with AI agents."
    />
  );
}
