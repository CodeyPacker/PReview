import type { AgentTask, AgentTaskStatus } from '../../shared/contracts/agent-tasks.ts';
import type { Status } from '../components/StatusPill/statusPresets.ts';

// The pill for each agent task state.
export const agentStatus: Record<AgentTaskStatus, Status> = {
  queued: 'agent-queued',
  running: 'agent-running',
  waiting: 'agent-waiting',
  stopped: 'agent-stopped',
  failed: 'agent-failed',
  completed: 'agent-completed',
};

// Whether the task is still working on its pull request.
export function agentIsBusy(task: AgentTask | undefined): boolean {
  return task?.status === 'queued' || task?.status === 'running' || task?.status === 'waiting';
}

// Why merging now would leave the agent's work out, or null when nothing is pending.
export function agentMergeWarning(task: AgentTask | undefined): string | null {
  if (!task) return null;
  if (agentIsBusy(task)) {
    return 'The agent is still working on this pull request. Merging now leaves its changes out.';
  }
  if (
    task.status === 'completed' &&
    (task.push?.status === 'waiting' || task.push?.status === 'blocked')
  ) {
    return "The agent has changes that aren't pushed. Merging now leaves them out.";
  }
  if (task.ci?.status === 'pending') return "CI is still running on the agent's changes.";
  return null;
}
