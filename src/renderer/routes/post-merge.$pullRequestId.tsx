import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Bug,
  ChevronRight,
  Crown,
  ExternalLink,
  FileText,
  GitPullRequest,
  House,
  Lightbulb,
  MessageSquare,
  Sword,
  X,
  Zap,
} from 'lucide-react';
import { AchievementCard } from '../components/AchievementCard/index.ts';
import { Avatar } from '../components/Avatar/index.ts';
import { Button } from '../components/Button/index.ts';
import { Donut } from '../components/Donut/index.ts';
import { IconButton } from '../components/IconButton/index.ts';
import { IconTile } from '../components/IconTile/index.ts';
import { Panel } from '../components/Panel/index.ts';
import { ProgressBar } from '../components/ProgressBar/index.ts';
import { StatCard, type StatCardProps } from '../components/StatCard/index.ts';
import { StatusPill } from '../components/StatusPill/index.ts';
import { Tag } from '../components/Tag/index.ts';
import { XPChip } from '../components/XPChip/index.ts';
import { useMergedPullRequest } from '../hooks/useMergedPullRequest.ts';
import { usePullRequests } from '../hooks/usePullRequests.ts';
import styles from './post-merge.module.css';

export const Route = createFileRoute('/post-merge/$pullRequestId')({ component: PostMergePage });

// Placeholder numbers until XP, characters and achievements exist (SCOPE 5.9).
const placeholderMergedAt = 'Oct 28, 2026, 2:14 PM';

const mergedAtFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const xp = [
  { label: 'Bugs caught', value: 250, color: 'chart-2', display: '+250 XP' },
  { label: 'Suggestions', value: 200, color: 'chart-3', display: '+200 XP' },
  { label: 'Comments', value: 120, color: 'chart-4', display: '+120 XP' },
  { label: 'Review completion', value: 80, color: 'chart-1', display: '+80 XP' },
];

function PostMergePage() {
  const pullRequestId = Number(Route.useParams().pullRequestId);
  const navigate = useNavigate();
  const { data: merged, isPending } = useMergedPullRequest(pullRequestId);
  const { data: pullRequestState } = usePullRequests();
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
            <Donut size={140} thickness={16} centerValue="+650" centerLabel="XP" segments={xp} />
          </Panel>
          <Panel
            className={styles.optional}
            title="Achievements Unlocked"
            action={
              <Button variant="plain" size="sm" iconEnd={<ArrowRight />}>
                View All
              </Button>
            }
          >
            <div className={styles.achievements}>
              <AchievementCard
                layout="row"
                title="Bug Hunter"
                icon={<Bug />}
                tone="warning"
                earnedAt={placeholderMergedAt}
                xp={250}
              />
              <AchievementCard
                layout="row"
                title="Review Streak"
                icon={<Zap />}
                tone="info"
                earnedAt={placeholderMergedAt}
                xp={200}
              />
            </div>
          </Panel>
        </div>

        <div className={styles.column}>
          <Panel title="Account Progress">
            <div className={styles.progress}>
              <IconTile icon={<Crown />} size="xl" />
              <div className={styles.progressBody}>
                <div className={styles.progressHead}>
                  <span className={styles.level}>Level 18</span>
                  <XPChip amount={650} />
                </div>
                <ProgressBar
                  value={48750}
                  max={75000}
                  aria-label="Account level progress"
                  valueLabel="48,750 / 75,000 XP"
                />
              </div>
            </div>
          </Panel>
          <Panel title="Character Progress">
            <div className={styles.progress}>
              <Avatar name="Shadow" size="xl" tone="accent" />
              <div className={styles.progressBody}>
                <div className={styles.progressHead}>
                  <span className={styles.level}>Shadow</span>
                  <XPChip amount={650} />
                </div>
                <ProgressBar
                  value={19070}
                  max={25000}
                  aria-label="Character level progress"
                  label="Level 12"
                  valueLabel="19,070 / 25,000 XP"
                />
              </div>
            </div>
            <Panel variant="sunken" padding="sm" className={styles.optional}>
              <div className={styles.cosmetic}>
                <IconTile icon={<Sword />} size="md" />
                <div className={styles.cosmeticBody}>
                  <span className={styles.cosmeticLabel}>New Cosmetic Unlocked</span>
                  <span>Purple Blade Effect</span>
                </div>
                <ChevronRight aria-hidden />
              </div>
            </Panel>
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
