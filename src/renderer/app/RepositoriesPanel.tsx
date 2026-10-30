import { GitBranch, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '../components/Button/Button.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { useRepositories, useRescan } from '../hooks/useRepositories.ts';
import styles from './RepositoriesPanel.module.css';

export function RepositoriesPanel() {
  const { data } = useRepositories();
  const rescan = useRescan();
  const repositories = data?.repositories ?? [];
  const scanning = data?.scanning ?? false;

  return (
    <Panel
      title="Repositories"
      icon={<GitBranch aria-hidden />}
      count={repositories.length}
      className={styles.panel}
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
              <div className={styles.text}>
                <p className="headline">
                  {repository.github
                    ? `${repository.github.owner}/${repository.github.name}`
                    : repository.name}
                </p>
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
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
