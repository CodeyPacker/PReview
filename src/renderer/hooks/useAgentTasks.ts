import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentTask,
  AnswerAgentQuestionInput,
  MoveAgentTaskInput,
} from '../../shared/contracts/agent-tasks.ts';

const agentTasksKey = ['agentTasks'] as const;
// Tasks change by themselves while an agent works, so the list is read again often then.
const ACTIVE_POLL_MS = 1000;
const IDLE_POLL_MS = 15_000;

export const isAgentActive = (task: AgentTask) =>
  task.status === 'queued' || task.status === 'running';

// Every agent task, newest first.
export function useAgentTasks() {
  return useQuery({
    queryKey: agentTasksKey,
    queryFn: () => window.preview.agentTasks.list(),
    refetchInterval: (query) =>
      query.state.data?.some(isAgentActive) ? ACTIVE_POLL_MS : IDLE_POLL_MS,
  });
}

// A task's activity feed, read again every second while active is true.
export function useAgentActivity(taskId: number | undefined, active: boolean) {
  return useQuery({
    queryKey: ['agentActivity', taskId],
    queryFn: () => window.preview.agentTasks.listActivity(taskId!),
    enabled: taskId !== undefined,
    refetchInterval: active ? ACTIVE_POLL_MS : false,
  });
}

// A task's changes that aren't pushed yet. Read when enabled is true.
export function useAgentChanges(taskId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['agentChanges', taskId],
    queryFn: () => window.preview.agentTasks.changes(taskId),
    enabled,
  });
}

type TaskAction = 'stop' | 'forceStop' | 'resume' | 'push' | 'investigate';

// Stops, force-stops, resumes or pushes a task, or sends its agent to look into failed CI.
export function useAgentTaskAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, taskId }: { action: TaskAction; taskId: number }) =>
      window.preview.agentTasks[action](taskId),
    onSettled: (_result, _error, { taskId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: agentTasksKey }),
        queryClient.invalidateQueries({ queryKey: ['agentActivity', taskId] }),
        queryClient.invalidateQueries({ queryKey: ['agentChanges', taskId] }),
      ]),
  });
}

// Moves a queued task up or down the queue.
export function useMoveAgentTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MoveAgentTaskInput) => window.preview.agentTasks.move(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: agentTasksKey }),
  });
}

// Sends answers to the agent waiting on a question.
export function useAnswerAgentQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answer: AnswerAgentQuestionInput) => window.preview.agentTasks.answer(answer),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: agentTasksKey }),
        queryClient.invalidateQueries({ queryKey: ['agentActivity'] }),
      ]),
  });
}
