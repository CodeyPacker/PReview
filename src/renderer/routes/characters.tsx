import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../app/PageHeader.tsx';

export const Route = createFileRoute('/characters')({ component: CharactersPage });

function CharactersPage() {
  return (
    <PageHeader title="Characters" description="Collect and customize your review companions." />
  );
}
