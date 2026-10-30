import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../app/PageHeader.tsx';

export const Route = createFileRoute('/settings')({ component: SettingsPage });

function SettingsPage() {
  return (
    <PageHeader
      title="Settings"
      description="Customize your experience and configure how PReview works."
    />
  );
}
