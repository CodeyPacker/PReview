import type { Options, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Settings } from '../../../shared/contracts/settings.ts';
import {
  agentReportSchema,
  type AgentProvider,
  type AgentRun,
  type AgentRunInput,
  type AgentRunResult,
} from '../provider.ts';
import { createActivityMapper, readQuestions } from './activity.ts';
import { ALLOWED_TOOLS, BLOCKED_TOOLS, createToolGate, PREVIEW_TOOL_SERVER } from './gate.ts';
import { InputQueue } from './input-queue.ts';
import { claudeRuntime } from './runtime.ts';
import { checkSignIn, loadSdk, type Sdk } from './sdk.ts';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Runs one task with the user's Claude Code in the worktree: sandboxed shell, gated tools, PReview's
// get_file_diff tool and a structured closing report.
export class ClaudeAgent implements AgentProvider {
  constructor(
    // The WSL distribution Claude Code runs in on Windows, and the model to use.
    private readonly settings: () => Pick<Settings, 'wslDistro' | 'agentModel'>,
    private readonly load: () => Promise<Sdk> = loadSdk,
  ) {}

  async start(input: AgentRunInput): Promise<AgentRun> {
    const sdk = await this.load();
    const { wslDistro, agentModel } = this.settings();
    const runtime = claudeRuntime(wslDistro);
    const failed = (error: string): AgentRun => ({
      result: Promise.resolve({ status: 'failed', error, retryable: false }),
      stop: () => Promise.resolve(),
      forceStop: () => {},
    });
    const couldNotStart = (error: unknown) => `Claude Code could not start: ${messageOf(error)}`;
    let options: Options;
    try {
      const setup = await runtime.setup();
      if ('problem' in setup) return failed(setup.problem);
      options = runtime.options(input.worktree, setup.executable);
    } catch (error) {
      return failed(couldNotStart(error));
    }
    const signIn = await checkSignIn(sdk, options, runtime.signInHint).catch((error: unknown) => ({
      signedIn: false,
      detail: couldNotStart(error),
    }));
    if (!signIn.signedIn) return failed(signIn.detail);

    const isolation = await runtime.isolate(input.worktree);
    const abort = new AbortController();
    const messages = new InputQueue();
    const activities = createActivityMapper(input.worktree, runtime.localPath);
    let stopping = false;
    let rateLimit: string | undefined;
    const tools = sdk.createSdkMcpServer({
      name: PREVIEW_TOOL_SERVER,
      tools: [
        sdk.tool(
          'get_file_diff',
          "The pull request's diff of one changed file.",
          { path: z.string().describe('The file path, relative to the repository root.') },
          ({ path }) =>
            Promise.resolve({ content: [{ type: 'text', text: input.getFileDiff(path) }] }),
        ),
        sdk.tool(
          'get_finding_screenshot',
          'A screenshot the reviewer attached to a finding.',
          { id: z.number().int().describe('The screenshot id listed with the finding.') },
          ({ id }) => {
            const data = input.getFindingScreenshot(id);
            return Promise.resolve({
              content: [
                data === null
                  ? { type: 'text' as const, text: `There is no screenshot ${id} on this task.` }
                  : { type: 'image' as const, data, mimeType: 'image/webp' },
              ],
            });
          },
        ),
      ],
    });
    const query = sdk.query({
      prompt: messages,
      options: {
        ...options,
        env: { ...options.env, ...isolation.env },
        ...(agentModel === 'default' ? {} : { model: agentModel }),
        permissionMode: 'default',
        settings: { permissions: { blockReadsOutsideWorkingDirectories: true } },
        // The tools it can see. AskUserQuestion goes through onQuestion below.
        tools: [...ALLOWED_TOOLS, 'AskUserQuestion'],
        disallowedTools: BLOCKED_TOOLS,
        canUseTool: createToolGate({
          root: input.worktree,
          localPath: runtime.localPath,
          onQuestion: async (questionInput, signal) => {
            const questions = readQuestions(questionInput);
            const answers = questions.length > 0 ? await input.ask(questions, signal) : null;
            return answers
              ? { behavior: 'allow', updatedInput: { ...questionInput, answers } }
              : {
                  behavior: 'deny',
                  message:
                    'The reviewer did not answer. Make the safest choice, or leave the item and mark it needs_input with your question.',
                };
          },
        }),
        sandbox: isolation.sandbox,
        mcpServers: { [PREVIEW_TOOL_SERVER]: tools },
        systemPrompt: { type: 'preset', preset: 'claude_code', append: input.instructions },
        // Claude Code's validator reads draft-07, not Zod's default 2020-12.
        outputFormat: {
          type: 'json_schema',
          schema: z.toJSONSchema(agentReportSchema, { target: 'draft-07' }),
        },
        ...(input.resume ? { resume: input.sessionId } : { sessionId: input.sessionId }),
        abortController: abort,
      },
    });
    messages.push(input.prompt);

    const finish = (message: SDKResultMessage): AgentRunResult => {
      if (stopping) return { status: 'stopped' };
      if (rateLimit) return { status: 'failed', error: rateLimit, retryable: false };
      if (message.subtype === 'success' && !message.is_error) {
        const report = agentReportSchema.safeParse(message.structured_output);
        return report.success
          ? { status: 'completed', report: report.data, costUsd: message.total_cost_usd }
          : { status: 'failed', error: 'Claude finished without a report.', retryable: false };
      }
      const error =
        message.subtype === 'success'
          ? message.result
          : message.errors.join('\n') || `Claude stopped: ${message.subtype}`;
      return {
        status: 'failed',
        error,
        retryable: message.subtype === 'success' || message.subtype === 'error_during_execution',
      };
    };

    const result = (async (): Promise<AgentRunResult> => {
      try {
        for await (const message of query) {
          activities(message).forEach(input.onActivity);
          if (
            message.type === 'rate_limit_event' &&
            message.rate_limit_info.status === 'rejected'
          ) {
            const resetsAt = message.rate_limit_info.resetsAt;
            rateLimit = `Claude usage limit reached.${
              typeof resetsAt === 'number'
                ? ` It resets ${new Date(resetsAt * 1000).toLocaleString()}.`
                : ''
            } Resume the task after that.`;
            void query.interrupt().catch(() => {});
          }
          if (message.type === 'result') return finish(message);
        }
        if (stopping) return { status: 'stopped' };
        return { status: 'failed', error: 'Claude Code ended without finishing.', retryable: true };
      } catch (error) {
        if (stopping) return { status: 'stopped' };
        return { status: 'failed', error: messageOf(error), retryable: true };
      } finally {
        messages.end();
        query.close();
        await isolation.close();
      }
    })();

    return {
      result,
      stop: async () => {
        stopping = true;
        await query.interrupt();
      },
      forceStop: () => {
        stopping = true;
        abort.abort();
      },
    };
  }
}
