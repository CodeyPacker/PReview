import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runTourPrompt } from './tour.ts';
import { checkSignIn, loadSdk, type Sdk } from './sdk.ts';
import { claudeRuntime } from './runtime.ts';

vi.mock('./sdk.ts', () => ({ loadSdk: vi.fn(), checkSignIn: vi.fn() }));
vi.mock('./runtime.ts', () => ({ claudeRuntime: vi.fn() }));

beforeEach(() => {
  vi.mocked(claudeRuntime).mockReturnValue({
    setup: () => Promise.resolve({ executable: '/bin/claude' }),
    options: () => ({ cwd: '/tmp/preview', settingSources: [] }),
    signInHint: 'Sign in.',
  } as unknown as ReturnType<typeof claudeRuntime>);
  vi.mocked(checkSignIn).mockResolvedValue({ signedIn: true, detail: '' });
});

function setup(message: unknown) {
  const close = vi.fn();
  const stream = Object.assign(
    (async function* () {
      yield await Promise.resolve(message);
    })(),
    { close },
  );
  const query = vi.fn<(input: { options: Options }) => typeof stream>().mockReturnValue(stream);
  vi.mocked(loadSdk).mockResolvedValue({ query } as unknown as Sdk);
  return { query, close };
}

describe('tour agent', () => {
  it('exposes no tools and validates the structured answer', async () => {
    const { query, close } = setup({
      type: 'result',
      subtype: 'success',
      is_error: false,
      structured_output: { answer: 'Explanation' },
    });
    await expect(
      runTourPrompt(
        'Explain',
        z.object({ answer: z.string() }),
        { wslDistro: '', agentModel: 'default' },
        '/tmp/preview',
      ),
    ).resolves.toEqual({ answer: 'Explanation' });
    const options = query.mock.calls[0]?.[0].options;
    expect(options).toMatchObject({
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      persistSession: false,
    });
    const gate = options?.canUseTool as () => Promise<unknown>;
    expect(await gate()).toMatchObject({ behavior: 'deny' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the query when the agent returns malformed output', async () => {
    const { close } = setup({
      type: 'result',
      subtype: 'success',
      is_error: false,
      structured_output: {},
    });
    await expect(
      runTourPrompt(
        'Explain',
        z.object({ answer: z.string() }),
        { wslDistro: '', agentModel: 'default' },
        '/tmp/preview',
      ),
    ).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });

  it('reports a missing sign-in before starting a generation', async () => {
    const { query } = setup({});
    vi.mocked(checkSignIn).mockResolvedValue({ signedIn: false, detail: 'Sign in to Claude.' });
    await expect(
      runTourPrompt(
        'Explain',
        z.object({ answer: z.string() }),
        { wslDistro: '', agentModel: 'default' },
        '/tmp/preview',
      ),
    ).rejects.toThrow('Sign in to Claude.');
    expect(query).not.toHaveBeenCalled();
  });
});
