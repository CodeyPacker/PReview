import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../app/PageHeader.tsx';

export const Route = createFileRoute('/achievements')({ component: AchievementsPage });

function AchievementsPage() {
  return (
    <PageHeader
      title="Achievements"
      description="Track your progress, earn rewards, and celebrate your code review journey."
    />
  );
}
