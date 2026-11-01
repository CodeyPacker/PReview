import { Dialog } from '@base-ui/react/dialog';
import { CircleAlert, CircleCheck, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { MergeMethod, ReviewVerdict } from '../../shared/contracts/pull-request-reviews.ts';
import { Button } from '../components/Button/Button.tsx';
import { TextField } from '../components/TextField/TextField.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { useDeleteBranch } from '../hooks/useDeleteBranch.ts';
import { useMergePullRequest } from '../hooks/useMergePullRequest.ts';
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
  // Unpublished findings to add to the review's body.
  findingIds: number[];
  // GitHub refuses approvals and change requests from a pull request's own author.
  ownPullRequest: boolean;
}

const verdictOptions = (ownPullRequest: boolean) =>
  [
    { value: 'approve', label: 'Approve', disabled: ownPullRequest },
    { value: 'request-changes', label: 'Request changes', disabled: ownPullRequest },
    { value: 'comment', label: 'Comment' },
  ] satisfies { value: ReviewVerdict; label: string; disabled?: boolean }[];

const mergeMethodOptions = [
  { value: 'merge', label: 'Merge commit' },
  { value: 'squash', label: 'Squash' },
  { value: 'rebase', label: 'Rebase' },
] satisfies { value: MergeMethod; label: string }[];

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// Sends a verdict, an optional summary and the line comments to GitHub. Once sent, it offers
// to merge. On your own pull request it offers to merge right away, because GitHub only takes
// a comment from you there and a comment needs a summary.
export function ReviewDialog({
  open,
  onOpenChange,
  pullRequestId,
  pullRequestUrl,
  headSha,
  mergeBase,
  draftIds,
  draftsOutsideDiff,
  findingIds,
  ownPullRequest,
}: ReviewDialogProps) {
  const submit = useSubmitReview();
  const [chosen, setChosen] = useState<ReviewVerdict>('approve');
  // The sign-in can finish after this opens, so the choice is checked against it every time.
  const verdict = ownPullRequest && chosen !== 'comment' ? 'comment' : chosen;
  const [body, setBody] = useState('');
  const merge = useMergePullRequest();
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('merge');
  const merged = merge.data?.status === 'merged';
  const mergeRejection = merge.data?.status === 'rejected' ? merge.data.message : undefined;
  const deleteBranch = useDeleteBranch();
  const branchDeleted = deleteBranch.data?.status === 'deleted';
  const deleteRejection =
    deleteBranch.data?.status === 'rejected' ? deleteBranch.data.message : undefined;

  // The findings fill the body when there are some, so no summary is needed then.
  const needsSummary = verdict !== 'approve' && findingIds.length === 0;
  const canSubmit = !submit.isPending && (!needsSummary || body.trim() !== '');
  const result = submit.data;
  const submitted = result?.status === 'submitted';
  const rejection = result?.status === 'rejected' ? result.message : undefined;
  const done = submitted || merged;
  const sentComments = submit.variables?.draftIds.length ?? 0;
  const sentFindings = submit.variables?.findingIds.length ?? 0;
  const sent = [
    sentComments > 0 && plural(sentComments, 'line comment'),
    sentFindings > 0 && plural(sentFindings, 'finding'),
  ]
    .filter(Boolean)
    .join(' and ');
  const draftNote = [
    draftIds.length > 0 && `Publishes ${plural(draftIds.length, 'line comment')} with this review.`,
    findingIds.length > 0 && `Adds ${plural(findingIds.length, 'finding')} after the summary.`,
    draftsOutsideDiff > 0 &&
      `Drafts outside the diff stay here: ${draftsOutsideDiff}. GitHub only takes comments on changed lines and the lines around them.`,
  ]
    .filter(Boolean)
    .join(' ');

  const close = (next: boolean) => {
    onOpenChange(next);
    // A finished review starts over the next time the dialog opens.
    if (!next && done) {
      submit.reset();
      merge.reset();
      deleteBranch.reset();
      setBody('');
    }
  };

  const mergeMethodPicker = (
    <ToggleGroup
      aria-label="Merge method"
      options={mergeMethodOptions}
      value={mergeMethod}
      onValueChange={setMergeMethod}
    />
  );
  const mergeError = (mergeRejection || merge.isError) && (
    <p className={styles.error} role="alert">
      <CircleAlert aria-hidden />
      {mergeRejection ?? 'Could not reach GitHub. Try again.'}
    </p>
  );
  const mergeButton = (
    <Button
      type="button"
      loading={merge.isPending}
      onClick={() => merge.mutate({ pullRequestId, headSha, method: mergeMethod })}
    >
      Merge pull request
    </Button>
  );

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          {done ? (
            <>
              <CircleCheck className={styles.done} aria-hidden />
              <Dialog.Title className="title-2">
                {merged ? 'Pull request merged' : 'Review submitted'}
              </Dialog.Title>
              <Dialog.Description className={styles.description}>
                {merged
                  ? branchDeleted
                    ? 'GitHub merged this pull request and deleted its branch.'
                    : 'GitHub merged this pull request.'
                  : sent
                    ? `GitHub has your review and ${sent}.`
                    : 'GitHub has your review.'}
              </Dialog.Description>
              {!merged && mergeMethodPicker}
              {mergeError}
              {(deleteRejection || deleteBranch.isError) && (
                <p className={styles.error} role="alert">
                  <CircleAlert aria-hidden />
                  {deleteRejection ?? 'Could not reach GitHub. Try again.'}
                </p>
              )}
              <div className={styles.actions}>
                <Button
                  render={<a href={pullRequestUrl} target="_blank" rel="noreferrer" />}
                  nativeButton={false}
                  variant="plain"
                  iconEnd={<ExternalLink />}
                >
                  View on GitHub
                </Button>
                {!merged && mergeButton}
                {merged && !branchDeleted && (
                  <Button
                    loading={deleteBranch.isPending}
                    onClick={() => deleteBranch.mutate({ pullRequestId })}
                  >
                    Delete branch
                  </Button>
                )}
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
                  submit.mutate({
                    pullRequestId,
                    headSha,
                    mergeBase,
                    draftIds,
                    findingIds,
                    verdict,
                    body,
                  });
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
                  You opened this pull request, so GitHub only allows a comment. You can merge
                  without one.
                </Dialog.Description>
              )}
              {ownPullRequest && mergeMethodPicker}
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
              {ownPullRequest && mergeError}
              <div className={styles.actions}>
                <Button variant="plain" type="button" onClick={() => close(false)}>
                  Cancel
                </Button>
                {ownPullRequest && mergeButton}
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
