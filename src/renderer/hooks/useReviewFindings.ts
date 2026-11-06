import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReviewFindingInput,
  ReviewFinding,
  SetFindingResolutionInput,
  UpdateReviewFindingInput,
} from '../../shared/contracts/review-findings.ts';
import { cheerCompanion } from '../lib/companionCheer.ts';

export const loadFindingScreenshot = (id: number) => window.preview.reviewFindings.screenshot(id);

// A pull request's findings, stored on this machine. Each change returns the full list,
// which replaces the cached one. Resolving a finding may award XP.
export function useReviewFindings(pullRequestId: number) {
  const queryClient = useQueryClient();
  const queryKey = ['reviewFindings', pullRequestId] as const;
  const replace = (findings: ReviewFinding[]) => queryClient.setQueryData(queryKey, findings);

  const findings = useQuery({
    queryKey,
    queryFn: () => window.preview.reviewFindings.list(pullRequestId),
  });
  const create = useMutation({
    mutationFn: (finding: CreateReviewFindingInput) =>
      window.preview.reviewFindings.create(finding),
    onSuccess: (saved) => {
      replace(saved);
      cheerCompanion();
    },
  });
  const update = useMutation({
    mutationFn: (finding: UpdateReviewFindingInput) =>
      window.preview.reviewFindings.update(finding),
    onSuccess: replace,
  });
  const setResolution = useMutation({
    mutationFn: (change: SetFindingResolutionInput) =>
      window.preview.reviewFindings.setResolution(change),
    onSuccess: (saved) => {
      replace(saved);
      return queryClient.invalidateQueries({ queryKey: ['progression'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => window.preview.reviewFindings.delete(pullRequestId, id),
    onSuccess: replace,
  });

  return { findings, create, update, setResolution, remove };
}
