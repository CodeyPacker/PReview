// The agent interface the runner talks to. Claude Code is the only adapter in the MVP.
import type {
  AgentEventKind,
  AgentQuestionItem,
  AgentReport,
} from '../../shared/contracts/agent-tasks.ts';

export { agentReportSchema, type AgentReport } from '../../shared/contracts/agent-tasks.ts';

// One entry for the activity feed. detail is the technical log behind summary.
export interface AgentActivity {
  kind: AgentEventKind;
  summary: string;
  detail?: string;
}

export interface AgentRunInput {
  // The worktree, as a real path.
  worktree: string;
  // The first message of a new session, or the next message of a resumed one.
  prompt: string;
  // Added to the agent's own system prompt.
  instructions: string;
  sessionId: string;
  // Continue the saved session sessionId instead of starting it.
  resume: boolean;
  // The pull request's diff of one file, for the agent to ask for.
  getFileDiff: (path: string) => string;
  // A screenshot of one of the task's findings, as base64 WebP. Null for any other id.
  getFindingScreenshot: (id: number) => string | null;
  // Called with each step worth showing in the activity feed.
  onActivity: (activity: AgentActivity) => void;
  // Asks the user. Resolves with answers keyed by question text, or null when the question
  // was withdrawn, such as when the task stopped.
  ask: (
    questions: AgentQuestionItem[],
    signal: AbortSignal,
  ) => Promise<Record<string, string> | null>;
}

export type AgentRunResult =
  | { status: 'completed'; report: AgentReport; costUsd: number | null }
  // retryable: trying again may work, such as after a crash or a lost connection.
  | { status: 'failed'; error: string; retryable: boolean }
  | { status: 'stopped' };

export interface AgentRun {
  result: Promise<AgentRunResult>;
  // Asks the agent to stop after its current step.
  stop: () => Promise<void>;
  // Ends the agent's process at once.
  forceStop: () => void;
}

export interface AgentProvider {
  start: (input: AgentRunInput) => Promise<AgentRun>;
}
