import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../app/PageHeader.tsx';

export const Route = createFileRoute('/dashboard')({ component: DashboardPage });

function DashboardPage() {
  return (
    <PageHeader
      title="Dashboard"
      description="Your review workload, progress and recent activity."
    />
  );
}
