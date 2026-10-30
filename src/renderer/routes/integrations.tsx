import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../app/PageHeader.tsx';

export const Route = createFileRoute('/integrations')({ component: IntegrationsPage });

function IntegrationsPage() {
  return (
    <PageHeader
      title="Integrations"
      description="Connect your repositories and tools to bring pull requests into PReview."
    />
  );
}
