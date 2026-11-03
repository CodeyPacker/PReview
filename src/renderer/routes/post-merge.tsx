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
import styles from './post-merge.module.css';

export const Route = createFileRoute('/post-merge')({ component: PostMergePage });

// Placeholder numbers until XP, characters and achievements exist (SCOPE 5.9).
const merged = { repository: 'company/frontend', number: 482, mergedAt: 'Oct 28, 2026, 2:14 PM' };

const stats: (StatCardProps & { label: string })[] = [
  {
    label: 'Bugs caught',
    value: 3,
    delta: 25,
    tone: 'danger',
    icon: <Bug />,
    data: [1, 2, 1, 3, 2, 3, 4],
  },
  {
    label: 'Suggestions',
    value: 5,
    delta: 40,
    tone: 'warning',
    icon: <Lightbulb />,
    data: [2, 3, 3, 4, 3, 5, 6],
  },
  {
    label: 'Comments',
    value: 4,
    delta: 33,
    tone: 'info',
    icon: <MessageSquare />,
    data: [1, 2, 2, 3, 3, 4, 5],
  },
  {
    label: 'Files reviewed',
    value: 12,
    delta: 20,
    tone: 'accent',
    icon: <FileText />,
    data: [4, 6, 5, 8, 7, 10, 12],
  },
];

const xp = [
  { label: 'Bugs caught', value: 250, color: 'chart-2', display: '+250 XP' },
  { label: 'Suggestions', value: 200, color: 'chart-3', display: '+200 XP' },
  { label: 'Comments', value: 120, color: 'chart-4', display: '+120 XP' },
  { label: 'Review completion', value: 80, color: 'chart-1', display: '+80 XP' },
];

function PostMergePage() {
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <Panel padding="sm">
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
            {merged.mergedAt}
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
            <Donut size={192} thickness={20} centerValue="+650" centerLabel="XP" segments={xp} />
          </Panel>
          <Panel
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
                earnedAt={merged.mergedAt}
                xp={250}
              />
              <AchievementCard
                layout="row"
                title="Review Streak"
                icon={<Zap />}
                tone="info"
                earnedAt={merged.mergedAt}
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
            <Panel variant="sunken" padding="sm">
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

      <Panel title="Next Steps">
        <div className={styles.steps}>
          <Button variant="primary" block iconStart={<GitPullRequest />} iconEnd={<ArrowRight />}>
            Open Next Pull Request
          </Button>
          <Button block iconStart={<ExternalLink />}>
            View on GitHub
          </Button>
          <Button block iconStart={<House />} onClick={() => void navigate({ to: '/dashboard' })}>
            Back to Dashboard
          </Button>
        </div>
      </Panel>
    </div>
  );
}
