import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// Built-in Claude Code tools an agent may use. Web access and subagents stay off.
export const ALLOWED_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'MultiEdit',
  'Bash',
  'TodoWrite',
];
export const BLOCKED_TOOLS = [
  'WebFetch',
  'WebSearch',
  'Task',
  'Agent',
  'NotebookEdit',
  'SlashCommand',
];

// The tools PReview serves to the agent itself, such as get_file_diff.
export const PREVIEW_TOOL_SERVER = 'preview';
const PREVIEW_TOOL_PREFIX = `mcp__${PREVIEW_TOOL_SERVER}__`;

// The real path of `path`, or of its nearest existing folder plus the rest, so a file that
// doesn't exist yet still resolves through symlinks.
async function realPathOf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;
    return join(await realPathOf(parent), relative(parent, path));
  }
}

// Whether `path`, relative paths taken from `root`, is `root` or inside it. `root` must
// already be a real path. path.relative ignores case on Windows.
export async function isInside(root: string, path: string): Promise<boolean> {
  const inside = relative(root, await realPathOf(resolve(root, path)));
  return inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
}

function pathsIn(input: Record<string, unknown>): string[] {
  return [input.file_path, input.path, input.notebook_path].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

export interface GateOptions {
  // The worktree, as a real path.
  root: string;
  // Called when the agent asks the user a question. Resolves with the answer as a result.
  onQuestion: (input: Record<string, unknown>, signal: AbortSignal) => Promise<PermissionResult>;
  // Called with every decision, for the activity log.
  onDecision?: (tool: string, result: PermissionResult) => void;
}

// Decides each tool call in code. Shell commands are confined by the OS sandbox, so Bash runs
// without asking as long as it stays inside the sandbox.
export function createToolGate({ root, onQuestion, onDecision }: GateOptions): CanUseTool {
  const decide = async (
    tool: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<PermissionResult> => {
    if (tool === 'AskUserQuestion') return onQuestion(input, signal);
    // PReview's own tools only read what PReview gives them.
    if (tool.startsWith(PREVIEW_TOOL_PREFIX)) return { behavior: 'allow', updatedInput: input };
    if (!ALLOWED_TOOLS.includes(tool))
      return { behavior: 'deny', message: `${tool} is not available in PReview.` };
    for (const path of pathsIn(input)) {
      if (!(await isInside(root, path)))
        return { behavior: 'deny', message: `Access outside the worktree is not allowed: ${path}` };
    }
    if (tool === 'Bash' && input.dangerouslyDisableSandbox)
      return { behavior: 'deny', message: 'Commands must run inside the sandbox.' };
    return { behavior: 'allow', updatedInput: input };
  };
  return async (tool, input, { signal }) => {
    const result = await decide(tool, input, signal);
    onDecision?.(tool, result);
    return result;
  };
}
