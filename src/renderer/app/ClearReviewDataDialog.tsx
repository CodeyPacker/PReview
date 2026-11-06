import { Dialog } from '@base-ui/react/dialog';
import { CircleAlert } from 'lucide-react';
import { Button } from '../components/Button/Button.tsx';
import { useClearReviewData } from '../hooks/useClearReviewData.ts';
import styles from './ReviewDialog.module.css';

export interface ClearReviewDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Asks before deleting, because this can't be undone without restoring a backup.
export function ClearReviewDataDialog({ open, onOpenChange }: ClearReviewDataDialogProps) {
  const clear = useClearReviewData();
  const failure =
    clear.data?.status === 'busy'
      ? 'An agent is working or a review is being sent. Try again when it finishes.'
      : clear.isError
        ? 'Could not delete the review data. Try again.'
        : undefined;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) clear.reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Title className="title-2">Delete review data?</Dialog.Title>
          <Dialog.Description className={styles.description}>
            This deletes unsent comments, findings, screenshots and agent history on this computer.
            Your settings, XP and anything already on GitHub stay. Backups keep a copy until they
            are replaced, which takes up to 7 days.
          </Dialog.Description>
          {failure && (
            <p className={styles.error} role="alert">
              <CircleAlert aria-hidden />
              {failure}
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="plain" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              tone="danger"
              loading={clear.isPending}
              onClick={() =>
                clear.mutate(undefined, {
                  onSuccess: (result) => {
                    if (result.status === 'cleared') onOpenChange(false);
                  },
                })
              }
            >
              Delete Review Data
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
