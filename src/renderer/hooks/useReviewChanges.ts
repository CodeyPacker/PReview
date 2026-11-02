import { useState } from 'react';
import type { PullRequest } from '../../shared/contracts/pull-requests.ts';
import { SINCE_REVIEW } from '../app/ChangedFiles.tsx';
import {
  usePullRequestChangesSince,
  usePullRequestCommitFiles,
  usePullRequestCommits,
  usePullRequestFiles,
  useRepositoryFiles,
} from './usePullRequestFiles.ts';
import { useReviewRounds } from './useReviewRounds.ts';

// The files a review looks at: all changes of the pull request, the changes since the last
// review, or one commit. It can also list the whole repository.
export function useReviewChanges(pullRequestId: number, pullRequest: PullRequest | undefined) {
  // The diff stays at the commits it opened with. New commits show when the reviewer asks.
  const [shownRefs, setShownRefs] = useState<{ headSha: string; baseBranch: string }>();
  if (pullRequest && !shownRefs) {
    setShownRefs({ headSha: pullRequest.headSha, baseBranch: pullRequest.baseBranch });
  }
  const files = usePullRequestFiles(pullRequestId, shownRefs?.headSha, shownRefs?.baseBranch);
  const commits = usePullRequestCommits(pullRequestId, files.data?.headSha);
  const rounds = useReviewRounds(pullRequestId, files.data?.headSha);
  const round = rounds.data?.at(-1);
  const baselineSha = round?.baselineSha ?? undefined;

  // The reviewer's pick: 'all', SINCE_REVIEW or a commit. A re-review opens on the changes since
  // the last one until they pick.
  const [chosenView, setChosenView] = useState<string>();
  const chosen = chosenView ?? (baselineSha ? SINCE_REVIEW : 'all');
  // A saved commit is used once the list shows it is still part of the pull request.
  const unknownCommit =
    chosen !== 'all' &&
    chosen !== SINCE_REVIEW &&
    !commits.data?.some((commit) => commit.sha === chosen);
  const view = (chosen === SINCE_REVIEW && !baselineSha) || unknownCommit ? 'all' : chosen;
  const sinceReview = view === SINCE_REVIEW;
  const commitSha = view === 'all' || sinceReview ? undefined : view;

  // Browsing lists the repository's files, including the ones the pull request leaves alone.
  const [browsing, setBrowsing] = useState(false);
  const repositoryFiles = useRepositoryFiles(pullRequestId, files.data?.headSha, browsing);
  // The changes since the last review, one commit on its own and browsing are read-only: no
  // file decisions, comments or threads.
  const readOnlyView = view !== 'all' || browsing;

  const commitFiles = usePullRequestCommitFiles(pullRequestId, commitSha);
  const sinceFiles = usePullRequestChangesSince(
    pullRequestId,
    sinceReview ? baselineSha : undefined,
    sinceReview ? files.data?.headSha : undefined,
  );
  const shown = sinceReview ? sinceFiles : commitSha ? commitFiles : files;

  // The list can be read after a push the last sync hadn't seen, so it counts as shown too.
  const newCommits =
    pullRequest !== undefined &&
    shownRefs !== undefined &&
    files.data !== undefined &&
    (pullRequest.baseBranch !== shownRefs.baseBranch ||
      (pullRequest.headSha !== shownRefs.headSha && pullRequest.headSha !== files.data.headSha));
  function showNewCommits() {
    if (pullRequest) {
      setShownRefs({ headSha: pullRequest.headSha, baseBranch: pullRequest.baseBranch });
    }
  }

  return {
    files,
    commits,
    rounds,
    round,
    baselineSha,
    chosenView,
    setChosenView,
    view,
    browsing,
    setBrowsing,
    repositoryFiles,
    readOnlyView,
    shown,
    newCommits,
    showNewCommits,
  };
}
