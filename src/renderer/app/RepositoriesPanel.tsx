import { GitBranch, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '../components/Button/Button.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { StatusDot } from '../components/StatusDot/StatusDot.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { useRepositories, useRescan } from '../hooks/useRepositories.ts';
import styles from './RepositoriesPanel.module.css';
import { repositoryName } from './repositoryName.ts';

export interface RepositoriesPanelProps {
  className?: string;
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}

export function RepositoriesPanel({ className, selectedId, onSelect }: RepositoriesPanelProps) {
  const { data } = useRepositories();
  const rescan = useRescan();
  const repositories = data?.repositories ?? [];
  const scanning = data?.scanning ?? false;

  return (
    <Panel
      className={className}
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
            <li key={repository.id}>
              <button
                type="button"
                className={styles.item}
                aria-current={repository.id === selectedId}
                onClick={() => onSelect(repository.id)}
              >
                <span className={styles.text}>
                  <span className="headline">{repositoryName(repository)}</span>
                  <span className={styles.path}>{repository.path}</span>
                </span>
                {repository.status === 'unavailable' ? (
                  <StatusPill tone="warning" icon={<TriangleAlert aria-hidden />}>
                    Unavailable
                  </StatusPill>
                ) : repository.settings.monitored ? (
                  <StatusDot tone="success" label="Monitoring" />
                ) : (
                  <StatusDot tone="neutral" label="Paused" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
