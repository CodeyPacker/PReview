import { TriangleAlert } from 'lucide-react';
import type { Repository, RepositorySettings } from '../../shared/contracts/repositories.ts';
import { Panel } from '../components/Panel/Panel.tsx';
import { Select } from '../components/Select/Select.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { Switch } from '../components/Switch/Switch.tsx';
import { useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import { usePullRequests } from '../hooks/usePullRequests.ts';
import { useSetRepositoryAccount, useUpdateRepositorySettings } from '../hooks/useRepositories.ts';
import styles from './RepositoryDetailPanel.module.css';
import { repositoryName } from './repositoryName.ts';

// GitHub logins have no underscores, so this never names an account.
const AUTOMATIC = '_automatic';

const SETTINGS = [
  {
    key: 'monitored',
    label: 'Monitor pull requests',
    description: 'Automatically add new pull requests to your inbox.',
  },
  {
    key: 'includeDrafts',
    label: 'Include drafts',
    description: 'Include draft pull requests in your review queue.',
  },
  {
    key: 'includeAutomated',
    label: 'Include automated PRs',
    description: 'Include pull requests from bots and automated tools.',
  },
] as const satisfies readonly {
  key: keyof RepositorySettings;
  label: string;
  description: string;
}[];

export function RepositoryDetailPanel({ repository }: { repository: Repository | undefined }) {
  const updateSettings = useUpdateRepositorySettings();

  if (!repository) {
    return (
      <Panel title="Repository settings">
        <p className={styles.empty}>Select a repository to change how PReview treats it.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title={repositoryName(repository)}
      action={
        repository.status === 'available' ? (
          <StatusPill tone="success" icon={null}>
            Available
          </StatusPill>
        ) : (
          <StatusPill tone="warning" icon={<TriangleAlert aria-hidden />}>
            Unavailable
          </StatusPill>
        )
      }
    >
      <p className={styles.path}>{repository.path}</p>
      {repository.github && <AccountPicker repository={repository} />}
      <ul className={styles.settings}>
        {SETTINGS.map(({ key, label, description }) => (
          <li key={key}>
            <Switch
              label={
                <span className={styles.setting}>
                  <span className="headline">{label}</span>
                  <span className={styles.description}>{description}</span>
                </span>
              }
              checked={repository.settings[key]}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ id: repository.id, patch: { [key]: checked } })
              }
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// Picks the GitHub account the repository's requests go out with. Automatic lets PReview
// choose the account that can push.
function AccountPicker({ repository }: { repository: Repository }) {
  const { data: auth } = useGitHubAuth();
  const { data: pullRequests } = usePullRequests();
  const setAccount = useSetRepositoryAccount();
  const accounts = auth?.accounts ?? [];
  if (accounts.length === 0) return null;

  const assigned = repository.account;
  const syncError = pullRequests?.errors.find(
    (error) => error.repositoryId === repository.id,
  )?.message;
  const options = [
    {
      value: AUTOMATIC,
      label: assigned && !assigned.manual ? `Automatic (@${assigned.login})` : 'Automatic',
    },
    ...accounts.map((account) => ({ value: account.login, label: `@${account.login}` })),
  ];

  return (
    <div className={styles.account}>
      <span className={styles.setting}>
        <span className="headline">GitHub account</span>
        <span className={styles.description}>
          {assigned
            ? 'Syncing and reviews use this account.'
            : (syncError ?? 'Not assigned yet. PReview picks one on the next sync.')}
        </span>
      </span>
      <Select
        size="sm"
        aria-label={`GitHub account for ${repositoryName(repository)}`}
        options={options}
        value={assigned?.manual ? assigned.login : AUTOMATIC}
        disabled={setAccount.isPending}
        onValueChange={(value) =>
          setAccount.mutate({ id: repository.id, login: value === AUTOMATIC ? null : value })
        }
      />
    </div>
  );
}
