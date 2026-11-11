import { access, readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { codexEnvironment, codexFailure, runCodexTourPrompt, type CodexTourExec } from './tour.ts';

const schema = z.object({ answer: z.string() });

function setup(output = '{"answer":"Explanation"}', stdout = '') {
  const run = vi.fn<CodexTourExec>().mockImplementation(async (_file, args) => {
    const path = args[args.indexOf('--output-last-message') + 1];
    if (!path) throw new Error('No output path');
    await writeFile(path, output);
    return { stdout, stderr: '' };
  });
  return run;
}

describe('Codex tour adapter', () => {
  it('sends the prompt through stdin, validates output and removes scratch files', async () => {
    const run = setup();
    expect(await runCodexTourPrompt('Explain this PR', schema, '', run)).toEqual({
      answer: 'Explanation',
    });
    const [command, args, cwd, prompt] = run.mock.calls[0]!;
    expect(command).toBe('codex');
    expect(args).toContain('--ignore-user-config');
    expect(args).toContain('--ignore-rules');
    expect(args).toContain('--ephemeral');
    expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only');
    expect(args).toContain('features.shell_tool=false');
    expect(args).toContain('features.plugins=false');
    expect(args).not.toContain('Explain this PR');
    expect(prompt).toContain('Explain this PR');
    await expect(access(cwd)).rejects.toThrow();
  });

  it('writes the requested JSON schema for the CLI', async () => {
    const run: CodexTourExec = async (_file, args) => {
      const schemaPath = args[args.indexOf('--output-schema') + 1]!;
      const content: unknown = JSON.parse(await readFile(schemaPath, 'utf8'));
      expect(content).toMatchObject({ type: 'object', required: ['answer'] });
      await writeFile(args[args.indexOf('--output-last-message') + 1]!, '{"answer":"OK"}');
      return { stdout: '', stderr: '' };
    };
    await expect(runCodexTourPrompt('Explain', schema, '', run)).resolves.toEqual({ answer: 'OK' });
  });

  it.each(['not JSON', '{"wrong":true}'])(
    'rejects malformed or mismatched output: %s',
    async (output) => {
      const run = setup(output);
      await expect(runCodexTourPrompt('Explain', schema, '', run)).rejects.toThrow();
      await expect(access(run.mock.calls[0]![2])).rejects.toThrow();
    },
  );

  it('reports CLI failure events even if an output file exists', async () => {
    const run = setup(
      '{"answer":"Partial"}',
      '{"type":"turn.failed","error":{"message":"Sign in to Codex."}}',
    );
    await expect(runCodexTourPrompt('Explain', schema, '', run)).rejects.toThrow(
      'Sign in to Codex.',
    );
    await expect(access(run.mock.calls[0]![2])).rejects.toThrow();
  });

  it('cleans up when the CLI process fails', async () => {
    const run = vi.fn<CodexTourExec>().mockRejectedValue(new Error('Codex is unavailable'));
    await expect(runCodexTourPrompt('Explain', schema, '', run)).rejects.toThrow(
      'Codex is unavailable',
    );
    await expect(access(run.mock.calls[0]![2])).rejects.toThrow();
  });

  it('does not forward unrelated service tokens to the CLI', () => {
    expect(
      codexEnvironment({
        HOME: '/home/user',
        PATH: '/bin',
        CODEX_HOME: '/home/user/.codex',
        GITHUB_TOKEN: 'secret',
        OPENAI_API_KEY: 'secret',
      }),
    ).toEqual({ HOME: '/home/user', PATH: '/bin', CODEX_HOME: '/home/user/.codex' });
  });

  it('ignores ordinary events and reads structured failures', () => {
    expect(codexFailure('not json\n{"type":"thread.started"}')).toBeUndefined();
    expect(codexFailure('{"type":"error","message":"Usage limit reached"}')).toBe(
      'Usage limit reached',
    );
  });
});
