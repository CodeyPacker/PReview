import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { Achievement } from '../../shared/contracts/achievements.ts';
import { achievementLooks } from '../app/achievementLooks.tsx';
import { PageHeader } from '../app/PageHeader.tsx';
import { AchievementCard } from '../components/AchievementCard/AchievementCard.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { ProgressBar } from '../components/ProgressBar/ProgressBar.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { useAchievements } from '../hooks/useAchievements.ts';
import { useProgression } from '../hooks/useProgression.ts';
import styles from './achievements.module.css';

export const Route = createFileRoute('/achievements')({ component: AchievementsPage });

type Filter = 'all' | 'earned' | 'progress' | 'locked';

// Locked means no progress yet.
const stateOf = (achievement: Achievement): Exclude<Filter, 'all'> => {
  if (achievement.earnedAt) return 'earned';
  return achievement.progress > 0 ? 'progress' : 'locked';
};

const earnedDate = (at: string) =>
  new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function AchievementsPage() {
  const { progression } = useProgression();
  const achievements = useAchievements();
  const [filter, setFilter] = useState<Filter>('all');
  const items = achievements.data ?? [];
  const count = (state: Filter) =>
    state === 'all' ? items.length : items.filter((item) => stateOf(item) === state).length;
  const shown = filter === 'all' ? items : items.filter((item) => stateOf(item) === filter);
  const account = progression.data?.account;
  const streak = progression.data?.streak;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Achievements"
        description="Track your progress, earn rewards, and celebrate your code review journey."
      />
      <Panel padding="sm">
        <div className={styles.hero}>
          <div className={styles.level}>
            <span className={styles.levelLabel}>Account Level</span>
            <span className={styles.levelNumber}>{account?.level ?? 1}</span>
          </div>
          <ProgressBar
            className={styles.levelBar}
            value={account?.levelXp ?? 0}
            max={account?.nextLevelXp ?? 1}
            aria-label="Account level progress"
            valueLabel={`${(account?.levelXp ?? 0).toLocaleString('en-US')} / ${(
              account?.nextLevelXp ?? 0
            ).toLocaleString('en-US')} XP`}
          />
          <p className={styles.streak}>
            {streak && streak.current > 0
              ? `${streak.current}-week review streak${streak.thisWeek ? '' : '. Finish a review this week to keep it.'}`
              : 'Finish a review this week to start a streak.'}
          </p>
        </div>
      </Panel>
      <Panel
        title="Badges"
        action={
          <ToggleGroup
            variant="pills"
            size="sm"
            aria-label="Show badges"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: count('all') },
              { value: 'earned', label: 'Earned', count: count('earned') },
              { value: 'progress', label: 'In Progress', count: count('progress') },
              { value: 'locked', label: 'Locked', count: count('locked') },
            ]}
          />
        }
      >
        {shown.length === 0 ? (
          <p className={styles.empty}>
            {achievements.isPending ? 'Loading badges…' : 'No badges here yet.'}
          </p>
        ) : (
          <div className={styles.grid}>
            {shown.map((achievement) => {
              const state = stateOf(achievement);
              return (
                <AchievementCard
                  key={achievement.id}
                  title={achievement.name}
                  description={achievement.description}
                  {...achievementLooks[achievement.metric]}
                  locked={state === 'locked'}
                  {...(achievement.earnedAt && { earnedAt: earnedDate(achievement.earnedAt) })}
                  {...(state === 'progress' && {
                    progress: { value: achievement.progress, max: achievement.target },
                  })}
                />
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
