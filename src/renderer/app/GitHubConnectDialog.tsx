import { Dialog } from '@base-ui/react/dialog';
import { CircleAlert, ExternalLink, GitPullRequest } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { IconTile } from '../components/IconTile/IconTile.tsx';
import {
  findAccount,
  useCancelGitHub,
  useConnectGitHub,
  useConnectGitHubCli,
  useGitHubAuth,
} from '../hooks/useGitHubAuth.ts';
import styles from './GitHubConnectDialog.module.css';

export interface GitHubConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Walks the user through adding a GitHub account: GitHub's device flow, where they enter a
// code in the browser, or the GitHub CLI's account in one step. Closing the dialog while a
// code is showing cancels the flow.
export function GitHubConnectDialog({ open, onOpenChange }: GitHubConnectDialogProps) {
  const { data: auth } = useGitHubAuth();
  const connect = useConnectGitHub();
  const connectCli = useConnectGitHubCli();
  const cancel = useCancelGitHub();
  // Set once the user starts a connect in this dialog, so its result shows only then.
  const [started, setStarted] = useState(false);
  const pending = auth?.pending;
  const added = started ? findAccount(auth, auth?.connected?.login) : undefined;
  const replaced = auth?.connected?.replaced ?? false;
  const hasAccounts = (auth?.accounts.length ?? 0) > 0;

  const close = () => {
    if (pending) cancel.mutate();
    setStarted(false);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          {pending ? (
            <>
              <Dialog.Title className="title-2">Enter this code on GitHub</Dialog.Title>
              <output className={styles.code} aria-label="Your code">
                {pending.userCode}
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
                  render={<a href={pending.verificationUri} target="_blank" rel="noreferrer" />}
                  nativeButton={false}
                  iconEnd={<ExternalLink />}
                >
                  Open GitHub again
                </Button>
              </div>
            </>
          ) : added ? (
            <>
              <Avatar name={added.name ?? added.login} src={added.avatarUrl} size="xl" />
              <Dialog.Title className="title-2">
                {replaced ? 'Already connected' : 'GitHub is connected'}
              </Dialog.Title>
              <Dialog.Description className={styles.description}>
                {replaced ? 'Already connected as' : 'Signed in as'} @{added.login}
                {added.source === 'cli' ? ' through the GitHub CLI.' : '.'}
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
              <Dialog.Title className="title-2">
                {hasAccounts ? 'Add a GitHub account' : 'Connect GitHub'}
              </Dialog.Title>
              <Dialog.Description className={styles.description}>
                {hasAccounts
                  ? 'Each repository uses the account that can push to it. Sign in with another account, or use the one the GitHub CLI is signed in as.'
                  : 'PReview brings in your pull requests and posts your reviews through GitHub. You’ll approve access in your browser.'}
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
                  variant="outline"
                  loading={connectCli.isPending}
                  onClick={() => {
                    setStarted(true);
                    connectCli.mutate();
                  }}
                >
                  Use GitHub CLI
                </Button>
                <Button
                  variant="primary"
                  loading={connect.isPending}
                  onClick={() => {
                    setStarted(true);
                    connect.mutate();
                  }}
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
