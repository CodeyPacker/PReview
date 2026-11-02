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

// One question an agent asks, with the choices it offers. The user may also answer in words.
export const agentQuestionItemSchema = z.object({
  question: z.string(),
  // A short label for the question, when the agent gives one.
  header: z.string().nullable(),
  options: z.array(z.object({ label: z.string(), description: z.string().nullable() })),
  multiSelect: z.boolean(),
});
export type AgentQuestionItem = z.infer<typeof agentQuestionItemSchema>;

export const agentQuestionSchema = z.object({
  id: z.number().int(),
  questions: z.array(agentQuestionItemSchema),
  createdAt: z.string(),
});
export type AgentQuestion = z.infer<typeof agentQuestionSchema>;

// waiting: the agent asked the user a question and is waiting for the answer.
export const agentTaskStatusSchema = z.enum([
  'queued',
  'running',
  'waiting',
  'stopped',
  'failed',
  'completed',
]);
export type AgentTaskStatus = z.infer<typeof agentTaskStatusSchema>;

export const agentTaskSchema = z.object({
  id: z.number().int(),
  pullRequestId: z.number().int(),
  status: agentTaskStatusSchema,
  attempts: z.number().int(),
  // Why the last run failed. Safe to show.
  error: z.string().nullable(),
  report: agentReportSchema.nullable(),
  costUsd: z.number().nullable(),
  // The unanswered question, when the status is waiting.
  question: agentQuestionSchema.nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type AgentTask = z.infer<typeof agentTaskSchema>;

export const agentEventKindSchema = z.enum([
  'status',
  'message',
  'tool',
  'file',
  'test',
  'error',
  'question',
  'answer',
]);
export type AgentEventKind = z.infer<typeof agentEventKindSchema>;

export const agentEventSchema = z.object({
  id: z.number().int(),
  kind: agentEventKindSchema,
  summary: z.string(),
  // The technical log behind the summary, such as a command's output.
  detail: z.string().nullable(),
  createdAt: z.string(),
});
export type AgentEvent = z.infer<typeof agentEventSchema>;

export const agentTaskIdInputSchema = z.object({ taskId: z.number().int() });

export const answerAgentQuestionInputSchema = z.object({
  questionId: z.number().int(),
  // Answers keyed by the question's text.
  answers: z.record(z.string(), z.string().trim().min(1).max(10_000)),
});
export type AnswerAgentQuestionInput = z.infer<typeof answerAgentQuestionInputSchema>;
