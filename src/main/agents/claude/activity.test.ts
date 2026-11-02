import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { createActivityMapper, isTestCommand, readQuestions } from './activity.ts';

const assistant = (content: unknown[]) =>
  ({ type: 'assistant', parent_tool_use_id: null, message: { content } }) as unknown as SDKMessage;
const toolResult = (id: string, content: string, isError = false) =>
  ({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
  }) as unknown as SDKMessage;

describe('createActivityMapper', () => {
  it('describes messages, edits and commands, with paths inside the worktree', () => {
    const map = createActivityMapper('/work/app');

    expect(
      map(
        assistant([
          { type: 'thinking', thinking: 'private' },
          { type: 'text', text: ' Looking at the comment. ' },
          { type: 'tool_use', id: '1', name: 'Edit', input: { file_path: '/work/app/src/a.ts' } },
          { type: 'tool_use', id: '2', name: 'Bash', input: { command: 'ls' } },
          {
            type: 'tool_use',
            id: '3',
            name: 'mcp__preview__get_file_diff',
            input: { path: 'b.ts' },
          },
          { type: 'tool_use', id: '4', name: 'TodoWrite', input: {} },
        ]),
      ),
    ).toEqual([
      { kind: 'message', summary: 'Looking at the comment.' },
      { kind: 'file', summary: 'Edited src/a.ts' },
      { kind: 'tool', summary: 'Ran ls' },
      { kind: 'tool', summary: 'Looked at the diff of b.ts' },
    ]);
  });

  it('reports whether a test run passed, with its output', () => {
    const map = createActivityMapper('/work/app');
    map(assistant([{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'pnpm test' } }]));

    expect(map(toolResult('t', '1 failed', true))).toEqual([
      { kind: 'test', summary: 'Tests failed', detail: '1 failed' },
    ]);
  });

  it('reports failed tools, and nothing for ones that worked', () => {
    const map = createActivityMapper('/work/app');
    map(
      assistant([
        { type: 'tool_use', id: 'r', name: 'Read', input: { file_path: '/elsewhere/x' } },
        { type: 'tool_use', id: 'g', name: 'Grep', input: { pattern: 'todo' } },
      ]),
    );

    expect(map(toolResult('r', 'denied', true))).toEqual([
      { kind: 'error', summary: 'Read failed', detail: 'denied' },
    ]);
    expect(map(toolResult('g', 'a.ts'))).toEqual([]);
  });
});

describe('isTestCommand', () => {
  it.each(['pnpm test', 'npm run test -- a', 'npx vitest run', 'cd app && pytest -q'])(
    'treats %s as a test run',
    (command) => expect(isTestCommand(command)).toBe(true),
  );
  it.each(['ls', 'pnpm build', 'cat test.txt'])('does not treat %s as one', (command) =>
    expect(isTestCommand(command)).toBe(false),
  );
});

describe('readQuestions', () => {
  it('reads questions and their options, dropping malformed ones', () => {
    expect(
      readQuestions({
        questions: [
          {
            question: 'Which name?',
            header: 'Naming',
            multiSelect: false,
            options: [{ label: 'token', description: 'Shorter' }, { label: '' }, { label: 'key' }],
          },
          { question: '' },
          'nonsense',
        ],
      }),
    ).toEqual([
      {
        question: 'Which name?',
        header: 'Naming',
        multiSelect: false,
        options: [
          { label: 'token', description: 'Shorter' },
          { label: 'key', description: null },
        ],
      },
    ]);
  });
});
