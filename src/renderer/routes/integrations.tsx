import { createFileRoute } from '@tanstack/react-router';
import { CircleAlert, GitPullRequest, Plus } from 'lucide-react';
import { useState } from 'react';
import { GitHubConnectDialog } from '../app/GitHubConnectDialog.tsx';
import { LocalFoldersPanel } from '../app/LocalFoldersPanel.tsx';
import { PageHeader } from '../app/PageHeader.tsx';
import { RepositoriesPanel } from '../app/RepositoriesPanel.tsx';
import { RepositoryDetailPanel } from '../app/RepositoryDetailPanel.tsx';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { IconTile } from '../components/IconTile/IconTile.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { useDisconnectGitHub, useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import { useRepositories } from '../hooks/useRepositories.ts';
import styles from './integrations.module.css';

export const Route = createFileRoute('/integrations')({ component: IntegrationsPage });

function IntegrationsPage() {
  const { data } = useRepositories();
  const [selectedId, setSelectedId] = useState<number>();
  const repositories = data?.repositories ?? [];
  const selected =
    repositories.find((repository) => repository.id === selectedId) ?? repositories[0];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Integrations"
        description="Connect your repositories and tools to bring pull requests into PReview."
      />
      <div className={styles.workspace}>
        <div className={styles.folders}>
          <LocalFoldersPanel />
          <RepositoriesPanel
            className={styles.repositories}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
        </div>
        <div className={styles.details}>
          <GitHubPanel />
          <RepositoryDetailPanel repository={selected} />
        </div>
      </div>
    </div>
  );
}

function GitHubPanel() {
  const { data: auth } = useGitHubAuth();
  const disconnect = useDisconnectGitHub();
  const [dialogOpen, setDialogOpen] = useState(false);
  const accounts = auth?.accounts ?? [];
  const error = auth?.error && (
    <p className={styles.error} role="alert">
      <CircleAlert aria-hidden />
      {auth.error}
    </p>
  );

  return (
    <Panel
      title="GitHub"
      action={
        accounts.length > 0 ? (
          <Button size="sm" iconStart={<Plus aria-hidden />} onClick={() => setDialogOpen(true)}>
            Add account
          </Button>
        ) : undefined
      }
    >
      {accounts.length === 0 ? (
        <div className={styles.row}>
          <IconTile icon={<GitPullRequest />} size="lg" tone="neutral" />
          <div className={styles.text}>
            <p className="headline">Not connected</p>
            <p className={styles.detail}>Connect to bring in pull requests and post reviews.</p>
            {error}
          </div>
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            Connect GitHub
          </Button>
        </div>
      ) : (
        <>
          <ul className={styles.accounts}>
            {accounts.map((account) => (
              <li key={account.login} className={styles.row}>
                <Avatar name={account.name ?? account.login} src={account.avatarUrl} size="lg" />
                <div className={styles.text}>
                  <p className="headline">{account.name ?? account.login}</p>
                  <p className={styles.detail}>
                    @{account.login}
                    {account.source === 'cli' ? ' · through the GitHub CLI' : ''}
                  </p>
                </div>
                <Button
                  variant="outline"
                  tone="danger"
                  aria-label={`Disconnect ${account.login}`}
                  loading={disconnect.isPending && disconnect.variables === account.login}
                  onClick={() => disconnect.mutate(account.login)}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
          {error}
        </>
      )}
      <GitHubConnectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Panel>
  );
}
