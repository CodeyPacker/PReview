import { Dialog } from '@base-ui/react/dialog';
import { CircleAlert, ExternalLink } from 'lucide-react';
import type { PullRequest } from '../../shared/contracts/pull-requests.ts';
import { Button } from '../components/Button/Button.tsx';
import { Markdown } from '../components/Markdown/Markdown.tsx';
import { usePullRequestDescription } from '../hooks/usePullRequestFiles.ts';
import { relativeTime } from './relativeTime.ts';
import styles from './PullRequestDetailsDialog.module.css';

export interface PullRequestDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pullRequest: PullRequest;
}

// The pull request's title and description. The description is read from GitHub when this first
// opens.
export function PullRequestDetailsDialog({
  open,
  onOpenChange,
  pullRequest,
}: PullRequestDetailsDialogProps) {
  const description = usePullRequestDescription(pullRequest.id, pullRequest.updatedAt, open);

  let body;
  if (description.isError) {
    body = (
      <p className={styles.error} role="alert">
        <CircleAlert aria-hidden />
        Could not reach GitHub. Try again.
      </p>
    );
  } else if (description.data === undefined) {
    body = <p className={styles.muted}>Loading…</p>;
  } else if (description.data.trim() === '') {
    body = <p className={styles.muted}>No description.</p>;
  } else {
    body = <Markdown>{description.data}</Markdown>;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Title className="title-2">{pullRequest.title}</Dialog.Title>
          <Dialog.Description className={styles.muted}>
            #{pullRequest.number} · {pullRequest.headBranch} → {pullRequest.baseBranch} · Opened{' '}
            {relativeTime(pullRequest.createdAt)} by{' '}
            {pullRequest.author?.login ?? 'an unknown author'}
          </Dialog.Description>
          <div className={styles.body}>{body}</div>
          <div className={styles.actions}>
            <Button
              render={<a href={pullRequest.url} target="_blank" rel="noreferrer" />}
              nativeButton={false}
              variant="plain"
              iconEnd={<ExternalLink />}
            >
              View on GitHub
            </Button>
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
