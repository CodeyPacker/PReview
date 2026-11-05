import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Bug,
  Crown,
  ExternalLink,
  FileText,
  GitPullRequest,
  House,
  Lightbulb,
  MessageSquare,
  X,
} from 'lucide-react';
import type { XpTransaction } from '../../shared/contracts/progression.ts';
import { achievementLooks } from '../app/achievementLooks.tsx';
import { AchievementCard } from '../components/AchievementCard/index.ts';
import { Avatar } from '../components/Avatar/index.ts';
import { Button } from '../components/Button/index.ts';
import { Donut } from '../components/Donut/index.ts';
import { IconButton } from '../components/IconButton/index.ts';
import { IconTile } from '../components/IconTile/index.ts';
import { Panel } from '../components/Panel/index.ts';
import { ProgressBar } from '../components/ProgressBar/index.ts';
import { Sprite } from '../components/Sprite/index.ts';
import { StatCard, type StatCardProps } from '../components/StatCard/index.ts';
import { StatusPill } from '../components/StatusPill/index.ts';
import { Tag } from '../components/Tag/index.ts';
import { XPChip } from '../components/XPChip/index.ts';
import { useAchievements } from '../hooks/useAchievements.ts';
import { useMergedPullRequest } from '../hooks/useMergedPullRequest.ts';
import { useProgression, usePullRequestXp } from '../hooks/useProgression.ts';
import { usePullRequests } from '../hooks/usePullRequests.ts';
import { characterArt } from '../lib/characterArt.ts';
import styles from './post-merge.module.css';

export const Route = createFileRoute('/post-merge/$pullRequestId')({ component: PostMergePage });

const mergedAtFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const xpGroups: { label: string; color: string; has: (award: XpTransaction) => boolean }[] = [
  {
    label: 'Bugs caught',
    color: 'chart-2',
    has: (award) =>
      award.reason === 'finding-resolved' &&
      ['bug', 'ui-bug', 'security'].includes(award.category ?? ''),
  },
  {
    label: 'Suggestions',
    color: 'chart-3',
    has: (award) =>
      award.reason === 'finding-resolved' && ['improvement', 'test'].includes(award.category ?? ''),
  },
  { label: 'Comments', color: 'chart-4', has: (award) => award.reason === 'comment-resolved' },
  {
    label: 'Review completion',
    color: 'chart-1',
    has: (award) => award.reason === 'review-completed',
  },
];

const xpLabel = (xp: number) => `${xp.toLocaleString('en-US')} XP`;

function PostMergePage() {
  const pullRequestId = Number(Route.useParams().pullRequestId);
  const navigate = useNavigate();
  const { data: merged, isPending } = useMergedPullRequest(pullRequestId);
  const { data: pullRequestState } = usePullRequests();
  const { data: awards = [] } = usePullRequestXp(pullRequestId);
  const { data: progression } = useProgression().progression;
  const { data: achievements = [] } = useAchievements();
  const nextPullRequest = pullRequestState?.pullRequests.find(
    (pull) => pull.id !== pullRequestId && pull.reviewState === 'needs-review',
  );

  if (isPending) return null;
  if (!merged) {
    return (
      <div className={styles.page}>
        <Panel title="Pull request not found">
          <Button iconStart={<House />} onClick={() => void navigate({ to: '/dashboard' })}>
            Back to Dashboard
          </Button>
        </Panel>
      </div>
    );
  }

  const mergedAt = mergedAtFormat.format(new Date(merged.mergedAt));
  const earned = awards.reduce((total, award) => total + award.amount, 0);
  const segments = xpGroups
    .map((group) => ({
      label: group.label,
      color: group.color,
      value: awards.filter(group.has).reduce((total, award) => total + award.amount, 0),
    }))
    .filter((segment) => segment.value > 0)
    .map((segment) => ({ ...segment, display: `+${xpLabel(segment.value)}` }));
  // Achievements earned from this pull request's first award up to now.
  const firstAward = awards[0]?.createdAt;
  const unlocked = firstAward
    ? achievements.filter((item) => item.earnedAt !== null && item.earnedAt >= firstAward)
    : [];
  const account = progression?.account;
  const characterId = awards[0]?.characterId ?? progression?.activeCharacter;
  const character = progression?.characters.find((item) => item.id === characterId);
  const art = character && characterArt[character.id];
  const characterXp = awards
    .filter((award) => award.characterId === characterId)
    .reduce((total, award) => total + award.amount, 0);
  const stats: (StatCardProps & { label: string })[] = [
    { label: 'Bugs caught', value: merged.bugsCaught, tone: 'danger', icon: <Bug /> },
    { label: 'Suggestions', value: merged.suggestions, tone: 'warning', icon: <Lightbulb /> },
    { label: 'Comments', value: merged.comments, tone: 'info', icon: <MessageSquare /> },
    { label: 'Files reviewed', value: merged.filesReviewed, tone: 'accent', icon: <FileText /> },
  ];

  return (
    <div className={styles.page}>
      <Panel padding="sm" className={styles.hero}>
        <div className={styles.art}>
          {art && (
            <Sprite
              className={styles.sprite}
              animation={art.victory}
              layers={art.layers.victory}
              label={character.name}
            />
          )}
          <IconButton
            icon={<X />}
            label="Close"
            className={styles.close}
            onClick={() => void navigate({ to: '/inbox' })}
          />
        </div>
        <div className={styles.details}>
          <Avatar name={merged.repository} shape="rounded" icon={<GitPullRequest />} />
          <span className={styles.repository}>{merged.repository}</span>
          <Tag tone="accent">#{merged.number}</Tag>
          <span className={styles.merged}>
            <StatusPill status="merged" />
            {mergedAt}
          </span>
        </div>
      </Panel>

      <div className={styles.stats}>
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className={styles.columns}>
        <div className={styles.column}>
          <Panel title="XP Earned">
            {earned === 0 ? (
              <p className={styles.empty}>This pull request earned no XP.</p>
            ) : (
              <Donut
                size={140}
                thickness={16}
                centerValue={`+${earned.toLocaleString('en-US')}`}
                centerLabel="XP"
                segments={segments}
              />
            )}
          </Panel>
          <Panel
            className={styles.optional}
            title="Achievements Unlocked"
            action={
              <Button
                variant="plain"
                size="sm"
                iconEnd={<ArrowRight />}
                onClick={() => void navigate({ to: '/achievements' })}
              >
                View All
              </Button>
            }
          >
            {unlocked.length === 0 ? (
              <p className={styles.empty}>No new achievements this time.</p>
            ) : (
              <div className={styles.achievements}>
                {unlocked.map((achievement) => (
                  <AchievementCard
                    key={achievement.id}
                    layout="row"
                    title={achievement.name}
                    {...achievementLooks[achievement.metric]}
                    earnedAt={achievement.earnedAt ?? ''}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className={styles.column}>
          <Panel title="Account Progress">
            <div className={styles.progress}>
              <IconTile icon={<Crown />} size="xl" />
              <div className={styles.progressBody}>
                <div className={styles.progressHead}>
                  <span className={styles.level}>Level {account?.level ?? 1}</span>
                  <XPChip amount={earned} />
                </div>
                <ProgressBar
                  value={account?.levelXp ?? 0}
                  max={account?.nextLevelXp ?? 1}
                  aria-label="Account level progress"
                  valueLabel={`${(account?.levelXp ?? 0).toLocaleString('en-US')} / ${xpLabel(
                    account?.nextLevelXp ?? 0,
                  )}`}
                />
              </div>
            </div>
          </Panel>
          <Panel title="Character Progress">
            <div className={styles.progress}>
              <Avatar
                name={character?.name ?? 'Shadow'}
                src={art?.portrait}
                size="xl"
                tone={art ? 'neutral' : 'accent'}
              />
              <div className={styles.progressBody}>
                <div className={styles.progressHead}>
                  <span className={styles.level}>{character?.name ?? 'Shadow'}</span>
                  <XPChip amount={characterXp} />
                </div>
                <ProgressBar
                  value={character?.levelXp ?? 0}
                  max={character?.nextLevelXp ?? 1}
                  aria-label="Character level progress"
                  label={`Level ${character?.level ?? 1}`}
                  valueLabel={`${(character?.levelXp ?? 0).toLocaleString('en-US')} / ${xpLabel(
                    character?.nextLevelXp ?? 0,
                  )}`}
                />
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className={styles.steps}>
        <Button
          variant="primary"
          block
          iconStart={<GitPullRequest />}
          iconEnd={<ArrowRight />}
          onClick={() =>
            void (nextPullRequest
              ? navigate({
                  to: '/review/$pullRequestId',
                  params: { pullRequestId: String(nextPullRequest.id) },
                })
              : navigate({ to: '/inbox' }))
          }
        >
          {nextPullRequest ? 'Open Next Pull Request' : 'Back to Inbox'}
        </Button>
        <Button
          block
          iconStart={<ExternalLink />}
          render={<a href={merged.url} target="_blank" rel="noreferrer" />}
          nativeButton={false}
        >
          View on GitHub
        </Button>
        <Button block iconStart={<House />} onClick={() => void navigate({ to: '/dashboard' })}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
