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
    mutationFn: (input: Omit<ReplyToThreadInput, 'pullRequestId'>) =>
      window.preview.pullRequestReviews.replyToThread({ ...input, pullRequestId }),
    onSuccess: refresh,
  });
  const setResolved = useMutation({
    mutationFn: (input: Omit<SetThreadResolvedInput, 'pullRequestId'>) =>
      window.preview.pullRequestReviews.setThreadResolved({ ...input, pullRequestId }),
    onSuccess: refresh,
  });
  return { reply, setResolved };
}
