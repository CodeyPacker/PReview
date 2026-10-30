import { GitBranch, RefreshCw, TriangleAlert } from 'lucide-react';
import type { Repository } from '../../shared/contracts/repositories.ts';
import { Button } from '../components/Button/Button.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { Switch } from '../components/Switch/Switch.tsx';
import {
  useRepositories,
  useRescan,
  useUpdateRepositorySettings,
} from '../hooks/useRepositories.ts';
import styles from './RepositoriesPanel.module.css';

const SETTINGS = [
  { key: 'monitored', label: 'Monitor pull requests' },
  { key: 'includeDrafts', label: 'Include drafts' },
  { key: 'includeAutomated', label: 'Include automated PRs' },
] as const;

function repositoryName(repository: Repository): string {
  return repository.github
    ? `${repository.github.owner}/${repository.github.name}`
    : repository.name;
}

export function RepositoriesPanel() {
  const { data } = useRepositories();
  const rescan = useRescan();
  const updateSettings = useUpdateRepositorySettings();
  const repositories = data?.repositories ?? [];
  const scanning = data?.scanning ?? false;

  return (
    <Panel
      title="Repositories"
      icon={<GitBranch aria-hidden />}
      count={repositories.length}
      action={
        <Button
          size="sm"
          iconStart={<RefreshCw aria-hidden />}
          loading={scanning || rescan.isPending}
          onClick={() => rescan.mutate()}
        >
          {scanning ? 'Scanning…' : 'Rescan'}
        </Button>
      }
    >
      {repositories.length === 0 ? (
        <p className={styles.empty}>
          {scanning
            ? 'Looking for Git repositories…'
            : 'No repositories found. Add a folder that contains your Git repositories.'}
        </p>
      ) : (
        <ul className={styles.list}>
          {repositories.map((repository) => (
            <li key={repository.id} className={styles.item}>
              <div className={styles.summary}>
                <div className={styles.text}>
                  <p className="headline">{repositoryName(repository)}</p>
                  <p className={styles.path}>{repository.path}</p>
                </div>
                {repository.status === 'available' ? (
                  <StatusPill tone="success" icon={null}>
                    Available
                  </StatusPill>
                ) : (
                  <StatusPill tone="warning" icon={<TriangleAlert aria-hidden />}>
                    Unavailable
                  </StatusPill>
                )}
              </div>
              <div className={styles.settings}>
                {SETTINGS.map(({ key, label }) => (
                  <Switch
                    key={key}
                    size="sm"
                    label={label}
                    aria-label={`${label} in ${repositoryName(repository)}`}
                    checked={repository.settings[key]}
                    onCheckedChange={(checked) =>
                      updateSettings.mutate({ id: repository.id, patch: { [key]: checked } })
                    }
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
