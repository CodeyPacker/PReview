import { Dialog } from '@base-ui/react/dialog';
import { CircleAlert, CircleCheck, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { ReviewVerdict } from '../../shared/contracts/pull-request-reviews.ts';
import { Button } from '../components/Button/Button.tsx';
import { TextField } from '../components/TextField/TextField.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { useSubmitReview } from '../hooks/useSubmitReview.ts';
import styles from './ReviewDialog.module.css';

export interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pullRequestId: number;
  pullRequestUrl: string;
  // The commits of the diff the reviewer looked at. The review is published against them.
  headSha: string;
  mergeBase: string;
  // Drafts to publish as line comments with the review.
  draftIds: number[];
  // Drafts on this diff that GitHub can't take, because their lines are outside it.
  draftsOutsideDiff: number;
  // GitHub refuses approvals and change requests from a pull request's own author.
  ownPullRequest: boolean;
}

const verdictOptions = (ownPullRequest: boolean) =>
  [
    { value: 'approve', label: 'Approve', disabled: ownPullRequest },
    { value: 'request-changes', label: 'Request changes', disabled: ownPullRequest },
    { value: 'comment', label: 'Comment' },
  ] satisfies { value: ReviewVerdict; label: string; disabled?: boolean }[];

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// Sends a verdict, an optional summary and the line comments to GitHub.
export function ReviewDialog({
  open,
  onOpenChange,
  pullRequestId,
  pullRequestUrl,
  headSha,
  mergeBase,
  draftIds,
  draftsOutsideDiff,
  ownPullRequest,
}: ReviewDialogProps) {
  const submit = useSubmitReview();
  const [chosen, setChosen] = useState<ReviewVerdict>('approve');
  // The sign-in can finish after this opens, so the choice is checked against it every time.
  const verdict = ownPullRequest && chosen !== 'comment' ? 'comment' : chosen;
  const [body, setBody] = useState('');

  const needsSummary = verdict !== 'approve';
  const canSubmit = !submit.isPending && (!needsSummary || body.trim() !== '');
  const result = submit.data;
  const submitted = result?.status === 'submitted';
  const rejection = result?.status === 'rejected' ? result.message : undefined;
  const sentComments = submit.variables?.draftIds.length ?? 0;
  const draftNote = [
    draftIds.length > 0 && `Publishes ${plural(draftIds.length, 'line comment')} with this review.`,
    draftsOutsideDiff > 0 &&
      `Drafts outside the diff stay here: ${draftsOutsideDiff}. GitHub only takes comments on changed lines and the lines around them.`,
  ]
    .filter(Boolean)
    .join(' ');

  const close = (next: boolean) => {
    onOpenChange(next);
    // A finished review starts over the next time the dialog opens.
    if (!next && submitted) {
      submit.reset();
      setBody('');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          {submitted ? (
            <>
              <CircleCheck className={styles.done} aria-hidden />
              <Dialog.Title className="title-2">Review submitted</Dialog.Title>
              <Dialog.Description className={styles.description}>
                {sentComments === 0
                  ? 'GitHub has your review.'
                  : `GitHub has your review and ${plural(sentComments, 'line comment')}.`}
              </Dialog.Description>
              <div className={styles.actions}>
                <Button
                  render={<a href={pullRequestUrl} target="_blank" rel="noreferrer" />}
                  nativeButton={false}
                  variant="plain"
                  iconEnd={<ExternalLink />}
                >
                  View on GitHub
                </Button>
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
                if (canSubmit) {
                  submit.mutate({ pullRequestId, headSha, mergeBase, draftIds, verdict, body });
                }
              }}
            >
              <Dialog.Title className="title-2">Submit your review</Dialog.Title>
              <ToggleGroup
                aria-label="Verdict"
                options={verdictOptions(ownPullRequest)}
                value={verdict}
                onValueChange={setChosen}
              />
              {draftNote && <p className={styles.description}>{draftNote}</p>}
              {ownPullRequest && (
                <Dialog.Description className={styles.description}>
                  You opened this pull request, so GitHub only allows a comment.
                </Dialog.Description>
              )}
              <TextField
                multiline
                rows={6}
                label={needsSummary ? 'Summary' : 'Summary (optional)'}
                value={body}
                onChange={(event) => setBody(event.target.value)}
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
                  Submit review
                </Button>
              </div>
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
