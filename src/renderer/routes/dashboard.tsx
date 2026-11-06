import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Bot,
  Bug,
  Calendar,
  CircleDot,
  FileText,
  GitPullRequest,
  Lightbulb,
  MessageSquare,
  Star,
} from 'lucide-react';
import { useMemo } from 'react';
import type { AgentTask } from '../../shared/contracts/agent-tasks.ts';
import type { PullRequest } from '../../shared/contracts/pull-requests.ts';
import { agentStatus } from '../app/agentStatus.ts';
import { relativeTime } from '../app/relativeTime.ts';
import { repositoryName } from '../app/repositoryName.ts';
import { characterArt } from '../lib/characterArt.ts';
import { cx } from '../lib/cx.ts';
import { Avatar } from '../components/Avatar/index.ts';
import { BarChart } from '../components/BarChart/index.ts';
import { Button } from '../components/Button/index.ts';
import { CharacterCard } from '../components/CharacterCard/index.ts';
import { IconTile } from '../components/IconTile/index.ts';
import { ListItem } from '../components/ListItem/index.ts';
import { Panel } from '../components/Panel/index.ts';
import { ProgressBar } from '../components/ProgressBar/index.ts';
import { StatCard, type StatCardProps } from '../components/StatCard/index.ts';
import type { ProgressStat } from '../../shared/contracts/progression.ts';
import { StatusPill } from '../components/StatusPill/index.ts';
import { TabPanel, Tabs } from '../components/Tabs/index.ts';
import { useAgentTasks } from '../hooks/useAgentTasks.ts';
import { useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import { useProgression, useProgressStats } from '../hooks/useProgression.ts';
import { usePullRequests } from '../hooks/usePullRequests.ts';
import { useRepositories } from '../hooks/useRepositories.ts';
import styles from './dashboard.module.css';

export const Route = createFileRoute('/dashboard')({ component: DashboardPage });

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  const { data: progression } = useProgression().progression;
  const { data: progressStats } = useProgressStats();
  const accountLevel = progression?.account;
  const activeCharacter = progression?.characters.find(
    (character) => character.id === progression.activeCharacter,
  );
  const activeArt = activeCharacter && characterArt[activeCharacter.id];
  const streakWeeks = progression?.streak.current ?? 0;
  const statCard = (
    label: string,
    tone: StatCardProps['tone'],
    icon: StatCardProps['icon'],
    stat: ProgressStat | undefined,
  ): StatCardProps & { label: string } => ({
    label,
    tone,
    icon,
    value: (stat?.total ?? 0).toLocaleString('en-US'),
    ...(stat?.delta != null && { delta: stat.delta }),
    data: stat?.days ?? [],
  });
  const stats = [
    statCard('Reviews Finished', 'accent', <FileText />, progressStats?.reviews),
    statCard('Bugs Caught', 'danger', <Bug />, progressStats?.bugs),
    statCard('Improvements Made', 'warning', <Lightbulb />, progressStats?.improvements),
    statCard('XP Earned', 'success', <Star />, progressStats?.xp),
  ];
  const thisWeek = progressStats?.thisWeek;

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
    // Running tasks come first, then the queue in the order it will run.
    groups.active.sort((a, b) => (a.queue?.position ?? 0) - (b.queue?.position ?? 0));
    return groups;
  }, [agentTasks]);

  // The greeting uses the first connected account.
  const [account] = auth?.accounts ?? [];
  const name = account ? (account.name ?? account.login) : undefined;
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
        <Panel padding="sm">
          <div className={styles.hero}>
            <div className={styles.greeting}>
              <span className={styles.greetingLead}>{greeting(new Date().getHours())}</span>
              <span className={styles.greetingName}>{name ?? 'there'}</span>
            </div>
            <p className={styles.heroText}>
              {pending.length === 0
                ? 'No pull requests are waiting for your review.'
                : `${pending.length} pull ${pending.length === 1 ? 'request' : 'requests'} waiting for your review.`}{' '}
              {streakWeeks > 0
                ? `You're on a ${streakWeeks}-week streak!`
                : 'Finish a review this week to start a streak.'}
            </p>
            <Button variant="primary" iconEnd={<ArrowRight />} onClick={openInbox}>
              Review Pull Requests
            </Button>
          </div>
        </Panel>
        <Panel title={`${name ? `${name}'s` : 'Your'} Progress`}>
          <div className={styles.progress}>
            <ProgressBar
              value={accountLevel?.levelXp ?? 0}
              max={accountLevel?.nextLevelXp ?? 1}
              aria-label="Account level progress"
              label={`Level ${accountLevel?.level ?? 1}`}
              valueLabel={`${(accountLevel?.levelXp ?? 0).toLocaleString('en-US')} / ${(
                accountLevel?.nextLevelXp ?? 0
              ).toLocaleString('en-US')} XP`}
            />
            <div className={styles.activeCharacter}>
              <Avatar
                name={activeCharacter?.name ?? 'Shadow'}
                src={activeCharacter && activeArt?.portrait(activeCharacter.outfit)}
                size="lg"
                tone={activeArt ? 'neutral' : 'accent'}
              />
              <div className={styles.characterText}>
                <span className={styles.characterName}>{activeCharacter?.name ?? 'Shadow'}</span>
                <span className={styles.characterLevel}>Level {activeCharacter?.level ?? 1}</span>
              </div>
              <Button
                size="sm"
                iconEnd={<ArrowRight />}
                onClick={() => void navigate({ to: '/characters' })}
              >
                View Character
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <div className={styles.stats}>
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className={styles.middle}>
        <Panel
          className={styles.fill}
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
        <Panel
          className={styles.fill}
          title="Recent Reviews"
          icon={<CircleDot aria-hidden />}
          action={viewAll}
        >
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
          className={cx(styles.fill, styles.optional)}
          title="This Week"
          icon={<Calendar aria-hidden />}
        >
          <div className={styles.week}>
            <dl className={styles.weekSummary}>
              {[
                { label: 'Reviews', value: thisWeek?.reviews ?? 0 },
                { label: 'Findings', value: thisWeek?.findings ?? 0 },
                { label: 'XP Earned', value: thisWeek?.xp ?? 0 },
              ].map((item) => (
                <div key={item.label} className={styles.weekStat}>
                  <dd>{item.value.toLocaleString('en-US')}</dd>
                  <dt>{item.label}</dt>
                </div>
              ))}
            </dl>
            <BarChart
              data={WEEKDAYS.map((label, index) => ({
                label,
                values: [thisWeek?.xpByDay[index] ?? 0],
              }))}
              series={[{ label: 'XP', color: 'chart-1' }]}
              fill
            />
          </div>
        </Panel>
      </div>

      <div className={styles.bottom}>
        <Panel className={styles.fill} title="Agent Work" icon={<Bot aria-hidden />}>
          <Tabs
            className={styles.tabs}
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
                          meta={
                            task.queue
                              ? `${task.queue.position} of ${task.queue.total} in queue`
                              : relativeTime(task.finishedAt ?? task.startedAt ?? task.createdAt)
                          }
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
          className={cx(styles.fill, styles.optional)}
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
            {(progression?.characters ?? []).map((character) => (
              <CharacterCard
                key={character.id}
                size="sm"
                name={character.name}
                image={
                  character.unlocked
                    ? characterArt[character.id]?.portrait(character.outfit)
                    : undefined
                }
                selected={character.id === progression?.activeCharacter}
                {...(character.unlocked
                  ? { level: character.level }
                  : { locked: true, unlockHint: `Unlock at Level ${character.unlockLevel}` })}
                onClick={() => void navigate({ to: '/characters' })}
              />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
