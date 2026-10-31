export type FileReviewState = 'approved' | 'flagged';
export type FileReviewFilter = 'all' | 'flagged' | 'not-approved';

export function matchesFileReviewFilter(
  state: FileReviewState | undefined,
  filter: FileReviewFilter,
): boolean {
  if (filter === 'flagged') return state === 'flagged';
  if (filter === 'not-approved') return state !== 'approved';
  return true;
}
