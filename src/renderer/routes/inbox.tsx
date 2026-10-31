import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CircleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { filterPullRequests } from '../app/filterPullRequests.ts';
import { PageHeader } from '../app/PageHeader.tsx';
import { PullRequestList } from '../app/PullRequestList.tsx';
import { PullRequestSummary } from '../app/PullRequestSummary.tsx';
import { repositoryName } from '../app/repositoryName.ts';
import { useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import { usePullRequests, useRefreshPullRequests } from '../hooks/usePullRequests.ts';
import { useRepositories } from '../hooks/useRepositories.ts';
import styles from './inbox.module.css';

export const Route = createFileRoute('/inbox')({ component: InboxPage });

const ALL_REPOSITORIES = 'all';

function InboxPage() {
  const { data: auth } = useGitHubAuth();
  const { data: repositoryState } = useRepositories();
  const { data: pullRequestState } = usePullRequests();
  const { mutate: refresh } = useRefreshPullRequests();
  const [search, setSearch] = useState('');
  const [repositoryValue, setRepositoryValue] = useState(ALL_REPOSITORIES);
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number>();

  // Opening the Inbox syncs right away instead of waiting for the next poll.
  useEffect(() => refresh(), [refresh]);

  const monitored = useMemo(
    () =>
      (repositoryState?.repositories ?? []).filter(
        (repository) =>
          repository.status === 'available' && repository.settings.monitored && repository.github,
      ),
    [repositoryState],
  );
  const repositoryNames = useMemo(
    () => new Map(monitored.map((repository) => [repository.id, repositoryName(repository)])),
    [monitored],
  );
  const repositoryOptions = [
    { value: ALL_REPOSITORIES, label: 'All repositories' },
    ...monitored.map((repository) => ({
      value: String(repository.id),
      label: repositoryName(repository),
    })),
  ];

  const allPullRequests = pullRequestState?.pullRequests;
  const pullRequests = useMemo(
    () =>
      filterPullRequests(allPullRequests ?? [], repositoryNames, {
        search,
        repositoryId: repositoryValue === ALL_REPOSITORIES ? undefined : Number(repositoryValue),
      }),
    [allPullRequests, repositoryNames, search, repositoryValue],
  );
  const selected = pullRequests.find((pull) => pull.id === selectedId) ?? pullRequests[0];
  const errors = pullRequestState?.errors ?? [];

  let emptyMessage = 'No pull requests match.';
  if (auth?.status === 'disconnected') {
    emptyMessage = 'Connect GitHub on the Integrations page to see pull requests.';
  } else if (monitored.length === 0) {
    emptyMessage = 'No monitored repositories. Turn on monitoring on the Integrations page.';
  } else if (allPullRequests?.length === 0) {
    emptyMessage = 'No open pull requests in your monitored repositories.';
  }

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <PageHeader
          title="Inbox"
          description="Review pull requests, track progress, and collaborate with AI agents."
        />
        {errors.length > 0 && (
          <ul className={styles.errors} role="alert">
            {errors.map(({ repositoryId, message }) => (
              <li key={repositoryId} className={styles.error}>
                <CircleAlert aria-hidden />
                {repositoryNames.get(repositoryId) ?? 'Repository'}: {message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.workspace}>
        <PullRequestList
          className={styles.list}
          pullRequests={pullRequests}
          repositoryNames={repositoryNames}
          emptyMessage={emptyMessage}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          search={search}
          onSearchChange={setSearch}
          repositoryOptions={repositoryOptions}
          repositoryValue={repositoryValue}
          onRepositoryChange={setRepositoryValue}
          syncing={pullRequestState?.syncing ?? false}
          onRefresh={() => refresh()}
        />
        <PullRequestSummary
          pullRequest={selected}
          repositoryName={selected && repositoryNames.get(selected.repositoryId)}
          onOpenReview={() => {
            if (selected) {
              void navigate({
                to: '/review/$pullRequestId',
                params: { pullRequestId: String(selected.id) },
              });
            }
          }}
        />
      </div>
    </div>
  );
}
