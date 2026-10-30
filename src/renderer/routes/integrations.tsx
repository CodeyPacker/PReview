import { createFileRoute } from '@tanstack/react-router';
import { CircleAlert, GitPullRequest } from 'lucide-react';
import { useState } from 'react';
import { GitHubConnectDialog } from '../app/GitHubConnectDialog.tsx';
import { PageHeader } from '../app/PageHeader.tsx';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { IconTile } from '../components/IconTile/IconTile.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { useDisconnectGitHub, useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import styles from './integrations.module.css';

export const Route = createFileRoute('/integrations')({ component: IntegrationsPage });

function IntegrationsPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Integrations"
        description="Connect your repositories and tools to bring pull requests into PReview."
      />
      <GitHubPanel />
    </div>
  );
}

function GitHubPanel() {
  const { data: auth } = useGitHubAuth();
  const disconnect = useDisconnectGitHub();
  const [dialogOpen, setDialogOpen] = useState(false);
  const connected = auth?.status === 'connected' ? auth : undefined;

  return (
    <Panel title="GitHub" className={styles.panel}>
      <div className={styles.row}>
        {connected ? (
          <Avatar
            name={connected.user.name ?? connected.user.login}
            src={connected.user.avatarUrl}
            size="lg"
          />
        ) : (
          <IconTile icon={<GitPullRequest />} size="lg" tone="neutral" />
        )}
        <div className={styles.text}>
          <p className="headline">
            {connected ? (connected.user.name ?? connected.user.login) : 'Not connected'}
          </p>
          <p className={styles.detail}>
            {connected
              ? `@${connected.user.login}`
              : 'Connect to bring in pull requests and post reviews.'}
          </p>
          {auth?.status === 'disconnected' && auth.error && (
            <p className={styles.error} role="alert">
              <CircleAlert aria-hidden />
              {auth.error}
            </p>
          )}
        </div>
        {connected ? (
          <div className={styles.actions}>
            <StatusPill tone="success" icon={null}>
              Connected
            </StatusPill>
            <Button
              variant="outline"
              tone="danger"
              loading={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            Connect GitHub
          </Button>
        )}
      </div>
      <GitHubConnectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Panel>
  );
}
