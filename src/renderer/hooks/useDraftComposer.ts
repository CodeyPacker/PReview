import { useState } from 'react';
import type { PullRequestChanges } from '../../shared/contracts/pull-request-files.ts';
import type { DraftComposerState } from '../app/DraftComments.tsx';
import type { useReviewDrafts } from './useReviewDrafts.ts';

// The comment being written in the diff, and saving it as a draft.
export function useDraftComposer(
  pullRequestId: number,
  shownChanges: PullRequestChanges | undefined,
  reviewDrafts: ReturnType<typeof useReviewDrafts>,
  // Shows the file a comment with unsent text is in.
  showFile: (path: string) => void,
) {
  const [composer, setComposer] = useState<DraftComposerState>();

  function changeComposer(next: DraftComposerState | undefined) {
    // A comment with unsent text stays open until it is saved or cancelled. Opening another
    // one goes back to it instead.
    const moved =
      next?.path !== composer?.path ||
      next?.side !== composer?.side ||
      next?.startLine !== composer?.startLine ||
      next?.line !== composer?.line ||
      next?.draftId !== composer?.draftId;
    if (next && moved && composer?.body.trim()) {
      showFile(composer.path);
      return;
    }
    reviewDrafts.create.reset();
    reviewDrafts.update.reset();
    setComposer(next);
  }

  function saveComposer() {
    if (!composer || !shownChanges) return;
    const done = { onSuccess: () => setComposer(undefined) };
    if (composer.draftId === undefined) {
      reviewDrafts.create.mutate(
        {
          pullRequestId,
          headSha: shownChanges.headSha,
          mergeBase: shownChanges.mergeBase,
          path: composer.path,
          side: composer.side,
          startLine: composer.startLine ?? null,
          line: composer.line,
          body: composer.body,
        },
        done,
      );
    } else {
      reviewDrafts.update.mutate(
        { pullRequestId, id: composer.draftId, body: composer.body },
        done,
      );
    }
  }

  return { composer, changeComposer, saveComposer };
}
