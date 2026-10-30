import { TriangleAlert } from 'lucide-react';
import type { Repository, RepositorySettings } from '../../shared/contracts/repositories.ts';
import { Panel } from '../components/Panel/Panel.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { Switch } from '../components/Switch/Switch.tsx';
import { useUpdateRepositorySettings } from '../hooks/useRepositories.ts';
import styles from './RepositoryDetailPanel.module.css';
import { repositoryName } from './repositoryName.ts';

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
