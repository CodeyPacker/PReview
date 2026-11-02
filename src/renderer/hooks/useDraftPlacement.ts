import { useEffect } from 'react';
import type {
  PullRequestChanges,
  PullRequestFile,
} from '../../shared/contracts/pull-request-files.ts';
import { inOneHunk } from '../lib/diffComments.ts';
import { useReviewDrafts } from './useReviewDrafts.ts';

// Sorts the pull request's drafts by how they sit on the diff on show.
export function useDraftPlacement(
  pullRequestId: number,
  shownChanges: PullRequestChanges | undefined,
  changedFiles: readonly PullRequestFile[] | undefined,
) {
  const reviewDrafts = useReviewDrafts(pullRequestId);
  const shownHeadSha = shownChanges?.headSha;
  const shownMergeBase = shownChanges?.mergeBase;
  // Drafts written on other commits stay stored, but only these line up with the diff on show.
  const currentDrafts = reviewDrafts.drafts.data?.filter(
    (draft) => draft.headSha === shownHeadSha && draft.mergeBase === shownMergeBase,
  );
  // Drafts written on older commits move to the ones on show once, or become outdated.
  const staleDrafts =
    shownChanges !== undefined &&
    reviewDrafts.drafts.data?.some(
      (draft) => draft.headSha !== shownHeadSha || draft.mergeBase !== shownMergeBase,
    );
  const { mutate: reattachDrafts } = reviewDrafts.reattach;
  useEffect(() => {
    if (staleDrafts && shownHeadSha && shownMergeBase) {
      reattachDrafts({ pullRequestId, headSha: shownHeadSha, mergeBase: shownMergeBase });
    }
  }, [staleDrafts, shownHeadSha, shownMergeBase, pullRequestId, reattachDrafts]);
  // GitHub only takes line comments inside a diff hunk. Drafts written elsewhere, and outdated
  // ones, stay local.
  const sendableDrafts =
    currentDrafts?.filter(
      (draft) =>
        !draft.outdated &&
        inOneHunk(
          changedFiles?.find((file) => file.path === draft.path)?.hunks ?? null,
          draft.side,
          draft.startLine ?? draft.line,
          draft.line,
        ),
    ) ?? [];

  return { reviewDrafts, currentDrafts, sendableDrafts };
}
