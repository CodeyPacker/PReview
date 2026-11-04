import { Dialog } from '@base-ui/react/dialog';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button/Button.tsx';
import { TextField } from '../components/TextField/TextField.tsx';
import { useSubmitReview } from '../hooks/useSubmitReview.ts';
import styles from './ReviewDialog.module.css';

// GitHub refuses a comment with no body, and findings fill it when there are some.
export const DEFAULT_AGENT_MESSAGE = 'Findings are in the comments.';

export interface AgentReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pullRequestId: number;
  // The commits of the diff the reviewer looked at. The review is published against them.
  headSha: string;
  mergeBase: string;
  // Drafts to publish as line comments with the review.
  draftIds: number[];
  // Drafts on this diff that GitHub can't take, because their lines are outside it.
  draftsOutsideDiff: number;
  // Unpublished findings to add to the review's body.
  findingIds: number[];
  // Unresolved discussions on the pull request, which the agent also reads.
  openThreads: number;
  // Called when the dialog closes after the review was sent.
  onDone?: () => void;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// Publishes the review as a comment and queues an agent task for it. The message is optional,
// since the agent reads the pull request's comments either way.
export function AgentReviewDialog({
  open,
  onOpenChange,
  pullRequestId,
  headSha,
  mergeBase,
  draftIds,
  draftsOutsideDiff,
  findingIds,
  openThreads,
  onDone,
}: AgentReviewDialogProps) {
  const submit = useSubmitReview();
  const [message, setMessage] = useState('');
  const result = submit.data;
  const queued = result?.status === 'queued';
  const done = result?.status === 'submitted' || queued;
  const rejection = result?.status === 'rejected' ? result.message : undefined;
  const hasWork = draftIds.length + findingIds.length + openThreads > 0 || message.trim() !== '';
  const canSubmit = !submit.isPending && hasWork;
  const work = [
    draftIds.length > 0 && plural(draftIds.length, 'line comment'),
    findingIds.length > 0 && plural(findingIds.length, 'finding'),
    openThreads > 0 && plural(openThreads, 'open discussion'),
  ]
    .filter(Boolean)
    .join(', ');

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next && done) {
      submit.reset();
      setMessage('');
      onDone?.();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          {done ? (
            <>
              {queued ? (
                <Clock className={styles.done} aria-hidden />
              ) : (
                <CircleCheck className={styles.done} aria-hidden />
              )}
              <Dialog.Title className="title-2">
                {queued ? 'Review queued' : 'Sent to the agent'}
              </Dialog.Title>
              <Dialog.Description className={styles.description}>
                {queued
                  ? 'PReview couldn’t reach GitHub. Your review is saved, and the agent starts once it sends.'
                  : 'GitHub has your review, and the agent task is queued. Its edits are pushed to this pull request when it finishes.'}
              </Dialog.Description>
              <div className={styles.actions}>
                <Button variant="primary" onClick={() => close(false)}>
                  Done
                </Button>
              </div>
            </>
          ) : (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSubmit) return;
                const body = message.trim() || (findingIds.length > 0 ? '' : DEFAULT_AGENT_MESSAGE);
                submit.mutate({
                  pullRequestId,
                  headSha,
                  mergeBase,
                  draftIds,
                  findingIds,
                  verdict: 'comment',
                  body,
                  sendToAgent: true,
                });
              }}
            >
              <Dialog.Title className="title-2">Submit to Agent</Dialog.Title>
              <Dialog.Description className={styles.description}>
                {work
                  ? `The agent works on ${work}.`
                  : 'There are no comments or findings yet. Add one, or tell the agent what to do.'}
                {draftsOutsideDiff > 0 &&
                  ` Drafts outside the diff stay here: ${draftsOutsideDiff}.`}
              </Dialog.Description>
              <TextField
                multiline
                rows={4}
                label="Message (optional)"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              {(rejection || submit.isError) && (
                <p className={styles.error} role="alert">
                  <CircleAlert aria-hidden />
                  {rejection ?? 'Could not reach GitHub. Try again.'}
                </p>
              )}
              <div className={styles.actions}>
                <Button variant="plain" type="button" onClick={() => close(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  loading={submit.isPending}
                  disabled={!canSubmit}
                >
                  Submit
                </Button>
              </div>
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
