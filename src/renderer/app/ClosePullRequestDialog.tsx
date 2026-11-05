import { Dialog } from '@base-ui/react/dialog';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { Button } from '../components/Button/Button.tsx';
import { useClosePullRequest } from '../hooks/useClosePullRequest.ts';
import styles from './ReviewDialog.module.css';

export interface ClosePullRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pullRequestId: number;
  number: number;
  // Whether an agent task is still working on this pull request.
  agentBusy: boolean;
  // Called once GitHub has closed the pull request.
  onClosed: () => void;
}

// Asks before closing, because everyone on the pull request sees it on GitHub.
export function ClosePullRequestDialog({
  open,
  onOpenChange,
  pullRequestId,
  number,
  agentBusy,
  onClosed,
}: ClosePullRequestDialogProps) {
  const closePullRequest = useClosePullRequest();
  const rejection =
    closePullRequest.data?.status === 'rejected' ? closePullRequest.data.message : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Title className="title-2">Close pull request #{number}?</Dialog.Title>
          <Dialog.Description className={styles.description}>
            GitHub closes it without merging, and its branch stays. Your unsent comments and
            findings here are deleted.
          </Dialog.Description>
          {agentBusy && (
            <p className={styles.warning} role="note">
              <TriangleAlert aria-hidden />
              The agent is still working on this pull request.
            </p>
          )}
          {(rejection || closePullRequest.isError) && (
            <p className={styles.error} role="alert">
              <CircleAlert aria-hidden />
              {rejection ?? 'Could not reach GitHub. Try again.'}
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="plain" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              tone="danger"
              loading={closePullRequest.isPending}
              onClick={() =>
                closePullRequest.mutate(
                  { pullRequestId },
                  {
                    onSuccess: (result) => {
                      if (result.status === 'closed') onClosed();
                    },
                  },
                )
              }
            >
              Close Pull Request
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
