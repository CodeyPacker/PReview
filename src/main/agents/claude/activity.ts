import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { isAbsolute, relative } from 'node:path';
import type { AgentQuestionItem } from '../../../shared/contracts/agent-tasks.ts';
import type { AgentActivity } from '../provider.ts';

const TEST_COMMAND =
  /(?:^|[\s;&|])(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|vitest|jest|pytest|go test|cargo test|node --test|playwright test)/;

export function isTestCommand(command: string): boolean {
  return TEST_COMMAND.test(command);
}

// A pipe, ; or || makes the exit code another command's, so it says nothing about the tests.
const MASKED_EXIT = /\||;/;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

// Turns Claude Code's messages into activity feed entries. Keeps track of tool calls so their
// results can be told apart, such as a test run passing or failing. Thinking is never shown.
export function createActivityMapper(worktree: string) {
  const calls = new Map<string, { name: string; input: Record<string, unknown> }>();
  const path = (value: unknown) => {
    const raw = text(value);
    if (!raw || !isAbsolute(raw)) return raw;
    const inside = relative(worktree, raw);
    return inside.startsWith('..') ? raw : inside;
  };

  const describe = (name: string, input: Record<string, unknown>): AgentActivity | null => {
    if (name === 'Bash') {
      const command = text(input.command);
      return isTestCommand(command)
        ? { kind: 'test', summary: `Running tests: ${command}` }
        : { kind: 'tool', summary: `Ran ${command}` };
    }
    if (name === 'Edit' || name === 'Write' || name === 'MultiEdit') {
      return { kind: 'file', summary: `Edited ${path(input.file_path)}` };
    }
    if (name === 'Read') return { kind: 'tool', summary: `Read ${path(input.file_path)}` };
    if (name === 'Glob' || name === 'Grep') {
      return { kind: 'tool', summary: `Searched for ${text(input.pattern)}` };
    }
    if (name === 'mcp__preview__get_file_diff') {
      return { kind: 'tool', summary: `Looked at the diff of ${text(input.path)}` };
    }
    // The runner records questions and the report itself, and to-do lists are internal
    // bookkeeping.
    if (name === 'AskUserQuestion' || name === 'TodoWrite' || name === 'StructuredOutput') {
      return null;
    }
    return { kind: 'tool', summary: `Used ${name}` };
  };

  return (message: SDKMessage): AgentActivity[] => {
    if (message.type === 'assistant' && message.parent_tool_use_id === null) {
      return message.message.content.flatMap((block): AgentActivity[] => {
        if (block.type === 'text' && block.text.trim()) {
          return [{ kind: 'message', summary: block.text.trim() }];
        }
        if (block.type === 'tool_use') {
          const input = (block.input ?? {}) as Record<string, unknown>;
          calls.set(block.id, { name: block.name, input });
          const activity = describe(block.name, input);
          return activity ? [activity] : [];
        }
        return [];
      });
    }
    if (message.type === 'user' && Array.isArray(message.message.content)) {
      return message.message.content.flatMap((block): AgentActivity[] => {
        if (block.type !== 'tool_result') return [];
        const call = calls.get(block.tool_use_id);
        calls.delete(block.tool_use_id);
        const output =
          typeof block.content === 'string'
            ? block.content
            : (block.content ?? []).map((part) => (part.type === 'text' ? part.text : '')).join('');
        const command = call?.name === 'Bash' ? text(call.input.command) : '';
        if (isTestCommand(command)) {
          const summary = MASKED_EXIT.test(command)
            ? 'Tests finished'
            : block.is_error
              ? 'Tests failed'
              : 'Tests passed';
          return [{ kind: 'test', summary, detail: output }];
        }
        if (block.is_error && call && call.name !== 'AskUserQuestion') {
          return [{ kind: 'error', summary: `${call.name} failed`, detail: output }];
        }
        return [];
      });
    }
    return [];
  };
}

// Reads AskUserQuestion's input. Anything malformed is dropped rather than shown.
export function readQuestions(input: Record<string, unknown>): AgentQuestionItem[] {
  const questions = Array.isArray(input.questions) ? (input.questions as unknown[]) : [];
  return questions.flatMap((value): AgentQuestionItem[] => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    const question = text(item.question).trim();
    if (!question) return [];
    const options = Array.isArray(item.options) ? (item.options as unknown[]) : [];
    return [
      {
        question,
        header: text(item.header) || null,
        options: options.flatMap((option) => {
          const entry = (option ?? {}) as Record<string, unknown>;
          const label = text(entry.label).trim();
          return label ? [{ label, description: text(entry.description) || null }] : [];
        }),
        multiSelect: item.multiSelect === true,
      },
    ];
  });
}
