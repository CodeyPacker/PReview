import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Bot,
  Bug,
  Calendar,
  CircleCheck,
  CircleDot,
  GitPullRequest,
  Lightbulb,
  MessageSquare,
} from 'lucide-react';
import { useMemo } from 'react';
import type { AgentTask } from '../../shared/contracts/agent-tasks.ts';
import type { PullRequest } from '../../shared/contracts/pull-requests.ts';
import { agentStatus } from '../app/agentStatus.ts';
import { relativeTime } from '../app/relativeTime.ts';
import { repositoryName } from '../app/repositoryName.ts';
import { Avatar } from '../components/Avatar/index.ts';
import { BarChart } from '../components/BarChart/index.ts';
import { Button } from '../components/Button/index.ts';
import { CharacterCard } from '../components/CharacterCard/index.ts';
import { IconTile } from '../components/IconTile/index.ts';
import { ListItem } from '../components/ListItem/index.ts';
import { Panel } from '../components/Panel/index.ts';
import { ProgressBar } from '../components/ProgressBar/index.ts';
import { StatCard, type StatCardProps } from '../components/StatCard/index.ts';
import { StatusPill } from '../components/StatusPill/index.ts';
import { TabPanel, Tabs } from '../components/Tabs/index.ts';
import { useAgentTasks } from '../hooks/useAgentTasks.ts';
import { useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import { usePullRequests } from '../hooks/usePullRequests.ts';
import { useRepositories } from '../hooks/useRepositories.ts';
import styles from './dashboard.module.css';

export const Route = createFileRoute('/dashboard')({ component: DashboardPage });

// Placeholder numbers until review statistics, XP, characters and achievements exist (SCOPE 5.1).
const placeholderStreakDays = 5;
const placeholderStats: (StatCardProps & { label: string })[] = [
  {
    label: 'Bugs Caught',
    value: 24,
    delta: 12,
    tone: 'danger',
    icon: <Bug />,
    data: [3, 5, 4, 7, 6, 9, 12],
  },
  {
    label: 'Changes Requested',
    value: 18,
    delta: 28,
    tone: 'info',
    icon: <GitPullRequest />,
    data: [2, 4, 3, 6, 5, 8, 9],
  },
  {
    label: 'Reviews Approved',
    value: 42,
    delta: 16,
    tone: 'success',
    icon: <CircleCheck />,
    data: [5, 6, 8, 7, 10, 12, 14],
  },
  {
    label: 'Improvements Suggested',
    value: 31,
    delta: 24,
    tone: 'warning',
    icon: <Lightbulb />,
    data: [4, 5, 7, 6, 9, 10, 13],
  },
];
const placeholderWeek = {
  summary: [
    { label: 'Reviews', value: '12' },
    { label: 'Findings', value: '8' },
    { label: 'XP Earned', value: '320' },
  ],
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => ({
    label,
    values: [[3, 7, 11, 7, 14, 5, 11][index]!],
  })),
};
const placeholderCharacters = [
  { name: 'Shadow', level: 4 },
  { name: 'Ember', level: 2 },
  { name: 'Frost', level: 1 },
];

const PENDING_STATES: readonly PullRequest['reviewState'][] = [
  'needs-review',
  'ready-for-rereview',
  'action-required',
];
const PENDING_SHOWN = 3;
const RECENT_SHOWN = 4;
const AGENT_TASKS_SHOWN = 3;

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning,';
  if (hour < 18) return 'Good afternoon,';
  return 'Good evening,';
}

type AgentTab = 'active' | 'completed' | 'attention';

const agentTabOf = (task: AgentTask): AgentTab => {
  if (task.status === 'queued' || task.status === 'running') return 'active';
  if (
    task.status === 'completed' &&
    task.push?.status !== 'waiting' &&
    task.ci?.status !== 'failed'
  )
    return 'completed';
  return 'attention';
};

function DashboardPage() {
  const navigate = useNavigate();
  const { data: auth } = useGitHubAuth();
  const { data: repositoryState } = useRepositories();
  const { data: pullRequestState } = usePullRequests();
  const { data: agentTasks } = useAgentTasks();

  const repositoryNames = useMemo(
    () =>
      new Map((repositoryState?.repositories ?? []).map((item) => [item.id, repositoryName(item)])),
    [repositoryState],
  );
  const pullRequests = useMemo(
    () =>
      [...(pullRequestState?.pullRequests ?? [])].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [pullRequestState],
  );
  const pending = pullRequests.filter((pull) => PENDING_STATES.includes(pull.reviewState));
  const recent = pullRequests.filter((pull) => pull.opened).slice(0, RECENT_SHOWN);
  const pullRequestById = useMemo(
    () => new Map(pullRequests.map((pull) => [pull.id, pull])),
    [pullRequests],
  );
  const tasksByTab = useMemo(() => {
    const groups: Record<AgentTab, AgentTask[]> = { active: [], completed: [], attention: [] };
    for (const task of agentTasks ?? []) groups[agentTabOf(task)].push(task);
    return groups;
  }, [agentTasks]);

  const name = auth?.status === 'connected' ? (auth.user.name ?? auth.user.login) : undefined;
  const openReview = (pullRequestId: number) =>
    void navigate({
      to: '/review/$pullRequestId',
      params: { pullRequestId: String(pullRequestId) },
    });
  const openInbox = () => void navigate({ to: '/inbox' });
  const viewAll = (
    <Button variant="plain" size="sm" iconEnd={<ArrowRight />} onClick={openInbox}>
      View All
    </Button>
  );

  const pullRequestRow = (pull: PullRequest, trailing: React.ReactNode) => (
    <ListItem
      key={pull.id}
      density="sm"
      onClick={() => openReview(pull.id)}
      leading={
        <Avatar
          name={pull.author?.login ?? 'Unknown author'}
          src={pull.author?.avatarUrl}
          size="md"
        />
      }
      eyebrow={repositoryNames.get(pull.repositoryId)}
      title={`#${pull.number} ${pull.title}`}
      meta={relativeTime(pull.updatedAt)}
      trailing={trailing}
    />
  );

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <div className={styles.topMain}>
          <Panel padding="lg">
            <div className={styles.hero}>
              <div className={styles.greeting}>
                <span className={styles.greetingLead}>{greeting(new Date().getHours())}</span>
                <span className={styles.greetingName}>{name ?? 'there'}</span>
              </div>
              <p className={styles.heroText}>
                {pending.length === 0
                  ? 'No pull requests are waiting for your review.'
                  : `${pending.length} pull ${pending.length === 1 ? 'request' : 'requests'} waiting for your review.`}
                <br />
                You&apos;re on a {placeholderStreakDays}-day streak!
              </p>
              <Button variant="primary" iconEnd={<ArrowRight />} onClick={openInbox}>
                Review Pull Requests
              </Button>
            </div>
          </Panel>
          <div className={styles.stats}>
            {placeholderStats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>
        <Panel title={`${name ? `${name}'s` : 'Your'} Progress`}>
          <div className={styles.progress}>
            <ProgressBar
              value={1250}
              max={2000}
              aria-label="Account level progress"
              label="Level 12"
              valueLabel="1,250 / 2,000 XP"
            />
            <div className={styles.activeCharacter}>
              <Avatar name="Shadow" size="xl" tone="accent" />
              <span className={styles.characterName}>Shadow</span>
              <span className={styles.characterLevel}>Level 4</span>
              <Button size="sm" iconEnd={<ArrowRight />}>
                View Character
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <div className={styles.middle}>
        <Panel
          title="Pending Reviews"
          icon={<GitPullRequest aria-hidden />}
          count={pending.length}
          action={viewAll}
        >
          {pending.length === 0 ? (
            <p className={styles.empty}>Nothing is waiting for your review.</p>
          ) : (
            <div className={styles.list}>
              {pending.slice(0, PENDING_SHOWN).map((pull) =>
                pullRequestRow(
                  pull,
                  <Button variant="primary" size="sm" onClick={() => openReview(pull.id)}>
                    Review
                  </Button>,
                ),
              )}
            </div>
          )}
        </Panel>
        <Panel title="Recent Reviews" icon={<CircleDot aria-hidden />} action={viewAll}>
          {recent.length === 0 ? (
            <p className={styles.empty}>Pull requests you open to review show up here.</p>
          ) : (
            <div className={styles.list}>
              {recent.map((pull) =>
                pullRequestRow(pull, <StatusPill status={pull.reviewState} size="sm" />),
              )}
            </div>
          )}
        </Panel>
        <Panel
          title="This Week"
          icon={<Calendar aria-hidden />}
          action={<span className={styles.placeholderNote}>Sample data</span>}
        >
          <dl className={styles.weekSummary}>
            {placeholderWeek.summary.map((item) => (
              <div key={item.label} className={styles.weekStat}>
                <dd>{item.value}</dd>
                <dt>{item.label}</dt>
              </div>
            ))}
          </dl>
          <BarChart data={placeholderWeek.days} height={120} />
        </Panel>
      </div>

      <div className={styles.bottom}>
        <Panel title="Agent Work" icon={<Bot aria-hidden />}>
          <Tabs
            aria-label="Agent work"
            size="sm"
            items={[
              { value: 'active', label: 'Active', count: tasksByTab.active.length },
              { value: 'completed', label: 'Completed' },
              { value: 'attention', label: 'Needs Attention', count: tasksByTab.attention.length },
            ]}
          >
            {(['active', 'completed', 'attention'] as const).map((tab) => (
              <TabPanel key={tab} value={tab}>
                {tasksByTab[tab].length === 0 ? (
                  <p className={styles.empty}>No agent tasks here.</p>
                ) : (
                  <div className={styles.list}>
                    {tasksByTab[tab].slice(0, AGENT_TASKS_SHOWN).map((task) => {
                      const pull = pullRequestById.get(task.pullRequestId);
                      return (
                        <ListItem
                          key={task.id}
                          density="sm"
                          onClick={() => openReview(task.pullRequestId)}
                          leading={<IconTile icon={<Bot />} tone="info" size="md" />}
                          eyebrow={pull && repositoryNames.get(pull.repositoryId)}
                          title={pull ? `#${pull.number} ${pull.title}` : 'Pull request'}
                          meta={relativeTime(task.finishedAt ?? task.startedAt ?? task.createdAt)}
                          trailing={<StatusPill status={agentStatus[task.status]} size="sm" />}
                        />
                      );
                    })}
                  </div>
                )}
              </TabPanel>
            ))}
          </Tabs>
        </Panel>
        <Panel
          title="Your Characters"
          icon={<MessageSquare aria-hidden />}
          action={
            <Button
              variant="plain"
              size="sm"
              iconEnd={<ArrowRight />}
              onClick={() => void navigate({ to: '/characters' })}
            >
              View All
            </Button>
          }
        >
          <div className={styles.characters}>
            {placeholderCharacters.map((character, index) => (
              <CharacterCard key={character.name} size="sm" selected={index === 0} {...character} />
            ))}
            <CharacterCard size="sm" name="Locked" locked unlockHint="Unlock at Level 20" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
