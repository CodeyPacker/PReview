import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReviewDraftInput,
  ReattachReviewDraftsInput,
  ReviewDraft,
  UpdateReviewDraftInput,
} from '../../shared/contracts/review-drafts.ts';

// A pull request's unsent line comments, stored on this machine. Each change returns the
// full list, which replaces the cached one.
export function useReviewDrafts(pullRequestId: number) {
  const queryClient = useQueryClient();
  const queryKey = ['reviewDrafts', pullRequestId] as const;
  // The pull request's review state depends on whether it has drafts.
  const replace = (drafts: ReviewDraft[]) => {
    queryClient.setQueryData(queryKey, drafts);
    void queryClient.invalidateQueries({ queryKey: ['pullRequests'] });
  };

  const drafts = useQuery({
    queryKey,
    queryFn: () => window.preview.reviewDrafts.list(pullRequestId),
  });
  const create = useMutation({
    mutationFn: (draft: CreateReviewDraftInput) => window.preview.reviewDrafts.create(draft),
    onSuccess: replace,
  });
  const update = useMutation({
    mutationFn: (draft: UpdateReviewDraftInput) => window.preview.reviewDrafts.update(draft),
    onSuccess: replace,
  });
  const remove = useMutation({
    mutationFn: (id: number) => window.preview.reviewDrafts.delete(pullRequestId, id),
    onSuccess: replace,
  });

  // Moves drafts from older commits to the ones on show, or marks them outdated.
  const reattach = useMutation({
    mutationFn: (move: ReattachReviewDraftsInput) => window.preview.reviewDrafts.reattach(move),
    onSuccess: replace,
  });

  return { drafts, create, update, remove, reattach };
}
