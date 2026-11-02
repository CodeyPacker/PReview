import type { AgentTaskStatus } from '../../shared/contracts/agent-tasks.ts';
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
