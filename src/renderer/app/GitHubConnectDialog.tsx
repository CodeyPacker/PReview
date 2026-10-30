import { Dialog } from '@base-ui/react/dialog';
import { CircleAlert, ExternalLink, GitPullRequest } from 'lucide-react';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { IconTile } from '../components/IconTile/IconTile.tsx';
import { useCancelGitHub, useConnectGitHub, useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import styles from './GitHubConnectDialog.module.css';

export interface GitHubConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Walks the user through GitHub's device flow: connect, enter the code in the browser,
// done. Closing the dialog while a code is showing cancels the flow.
export function GitHubConnectDialog({ open, onOpenChange }: GitHubConnectDialogProps) {
  const { data: auth } = useGitHubAuth();
  const connect = useConnectGitHub();
  const cancel = useCancelGitHub();

  const close = () => {
    if (auth?.status === 'pending') cancel.mutate();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          {auth?.status === 'pending' ? (
            <>
              <Dialog.Title className="title-2">Enter this code on GitHub</Dialog.Title>
              <output className={styles.code} aria-label="Your code">
                {auth.userCode}
              </output>
              <Dialog.Description className={styles.description}>
                It’s copied, and GitHub is open in your browser. Paste the code there and click
                Authorize.
              </Dialog.Description>
              <p className={styles.waiting} role="status">
                <span className={styles.spinner} aria-hidden />
                Waiting for GitHub…
              </p>
              <div className={styles.actions}>
                <Button variant="plain" onClick={close}>
                  Cancel
                </Button>
                <Button
                  render={<a href={auth.verificationUri} target="_blank" rel="noreferrer" />}
                  nativeButton={false}
                  iconEnd={<ExternalLink />}
                >
                  Open GitHub again
                </Button>
              </div>
            </>
          ) : auth?.status === 'connected' ? (
            <>
              <Avatar
                name={auth.user.name ?? auth.user.login}
                src={auth.user.avatarUrl}
                size="xl"
              />
              <Dialog.Title className="title-2">GitHub is connected</Dialog.Title>
              <Dialog.Description className={styles.description}>
                Signed in as @{auth.user.login}.
              </Dialog.Description>
              <div className={styles.actions}>
                <Button variant="primary" onClick={close}>
                  Done
                </Button>
              </div>
            </>
          ) : (
            <>
              <IconTile icon={<GitPullRequest />} size="xl" />
              <Dialog.Title className="title-2">Connect GitHub</Dialog.Title>
              <Dialog.Description className={styles.description}>
                PReview brings in your pull requests and posts your reviews through GitHub. You’ll
                approve access in your browser.
              </Dialog.Description>
              {auth?.error && (
                <p className={styles.error} role="alert">
                  <CircleAlert aria-hidden />
                  {auth.error}
                </p>
              )}
              <div className={styles.actions}>
                <Button variant="plain" onClick={close}>
                  Not now
                </Button>
                <Button
                  variant="primary"
                  loading={connect.isPending}
                  onClick={() => connect.mutate()}
                >
                  Connect GitHub
                </Button>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
