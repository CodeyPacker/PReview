import { GitPullRequest, RefreshCw } from 'lucide-react';
import type { AgentTaskStatus } from '../../shared/contracts/agent-tasks.ts';
import type { PullRequest } from '../../shared/contracts/pull-requests.ts';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { SearchField } from '../components/SearchField/SearchField.tsx';
import { Select } from '../components/Select/Select.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { agentStatus } from './agentStatus.ts';
import styles from './PullRequestList.module.css';
import { relativeTime } from './relativeTime.ts';

export interface PullRequestListProps {
  className?: string;
  pullRequests: readonly PullRequest[];
  repositoryNames: ReadonlyMap<number, string>;
  // The state of each pull request's latest agent task.
  agentStatuses: ReadonlyMap<number, AgentTaskStatus>;
  // Shown when there are no pull requests to list.
  emptyMessage: string;
  selectedId: number | undefined;
  onSelect: (id: number) => void;
  search: string;
  onSearchChange: (search: string) => void;
  repositoryOptions: { value: string; label: string }[];
  repositoryValue: string;
  onRepositoryChange: (value: string) => void;
  syncing: boolean;
  onRefresh: () => void;
}

export function PullRequestList({
  className,
  pullRequests,
  repositoryNames,
  agentStatuses,
  emptyMessage,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  repositoryOptions,
  repositoryValue,
  onRepositoryChange,
  syncing,
  onRefresh,
}: PullRequestListProps) {
  return (
    <Panel
      className={className}
      title="Pull requests"
      icon={<GitPullRequest aria-hidden />}
      count={pullRequests.length}
      action={
        <Button
          size="sm"
          iconStart={<RefreshCw aria-hidden />}
          loading={syncing}
          onClick={onRefresh}
        >
          {syncing ? 'Syncing…' : 'Refresh'}
        </Button>
      }
    >
      <div className={styles.filters}>
        <SearchField
          placeholder="Filter pull requests…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <Select
          aria-label="Repository"
          options={repositoryOptions}
          value={repositoryValue}
          onValueChange={onRepositoryChange}
        />
      </div>
      {pullRequests.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <ul className={styles.list}>
          {pullRequests.map((pull) => (
            <li key={pull.id}>
              <button
                type="button"
                className={styles.item}
                aria-current={pull.id === selectedId}
                onClick={() => onSelect(pull.id)}
              >
                <Avatar
                  name={pull.author?.login ?? 'Unknown author'}
                  src={pull.author?.avatarUrl}
                  size="md"
                />
                <span className={styles.text}>
                  <span className={styles.repository}>
                    {repositoryNames.get(pull.repositoryId)}
                  </span>
                  <span className="headline">{pull.title}</span>
                  <span className={styles.meta}>
                    #{pull.number} · {pull.author?.login ?? 'unknown author'} ·{' '}
                    {relativeTime(pull.updatedAt)}
                  </span>
                </span>
                <span className={styles.states}>
                  {pull.draft && <StatusPill status="draft" />}
                  <StatusPill status={pull.reviewState} />
                  {agentStatuses.has(pull.id) && (
                    <StatusPill status={agentStatus[agentStatuses.get(pull.id)!]} />
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
