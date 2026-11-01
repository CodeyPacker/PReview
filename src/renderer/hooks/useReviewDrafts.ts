import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReviewDraftInput,
  ReviewDraft,
  UpdateReviewDraftInput,
} from '../../shared/contracts/review-drafts.ts';

// A pull request's unsent line comments, stored on this machine. Each change returns the
// full list, which replaces the cached one.
export function useReviewDrafts(pullRequestId: number) {
  const queryClient = useQueryClient();
  const queryKey = ['reviewDrafts', pullRequestId] as const;
  const replace = (drafts: ReviewDraft[]) => queryClient.setQueryData(queryKey, drafts);

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

  return { drafts, create, update, remove };
}
