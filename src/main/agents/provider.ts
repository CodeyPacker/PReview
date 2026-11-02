// The agent interface the runner talks to. Claude Code is the only adapter in the MVP.
import { z } from 'zod';

// The agent's closing report. Items are named by the ids the task gives them, C1 for line
// comments and F1 for findings.
export const agentReportSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      outcome: z.enum(['fixed', 'not_fixed', 'needs_input']),
      // What was done, or why not.
      note: z.string(),
    }),
  ),
  tests: z.array(
    z.object({
      command: z.string(),
      passed: z.boolean(),
      summary: z.string(),
    }),
  ),
  summary: z.string(),
});
export type AgentReport = z.infer<typeof agentReportSchema>;

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
