import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ReplyToThreadInput,
  SetThreadResolvedInput,
} from '../../shared/contracts/pull-request-reviews.ts';

// Replies to and resolves a pull request's threads on GitHub. Each change reads the threads
// again, and settles once they are read, so the change is on screen when it resolves.
export function useThreadActions(pullRequestId: number) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['reviewThreads', pullRequestId] });

  const reply = useMutation({
    mutationFn: (input: ReplyToThreadInput) =>
      window.preview.pullRequestReviews.replyToThread(input),
    onSuccess: refresh,
  });
  const setResolved = useMutation({
    mutationFn: (input: SetThreadResolvedInput) =>
      window.preview.pullRequestReviews.setThreadResolved(input),
    onSuccess: refresh,
  });
  return { reply, setResolved };
}
