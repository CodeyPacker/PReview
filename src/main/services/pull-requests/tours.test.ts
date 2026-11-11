import { describe, expect, it, vi } from 'vitest';
import { startTourInputSchema } from '../../../shared/contracts/tours.ts';
import { Tours, tourCode, tourOutlineSchema } from './tours.ts';
import type { PullRequestFile } from '../../../shared/contracts/pull-request-files.ts';

const input = { pullRequestId: 1, headSha: 'a'.repeat(40), mergeBase: 'b'.repeat(40) };
const file: PullRequestFile = {
  path: 'src/a.ts',
  previousPath: null,
  status: 'modified',
  blobSha: 'c',
  additions: 1,
  deletions: 1,
  hunks: [{ originalStart: 1, originalCount: 2, modifiedStart: 1, modifiedCount: 2 }],
};
const diff = {
  original: 'const a = 1;\n',
  modified: 'const a = 2;\n',
  unavailable: null,
  images: null,
};
const stop = {
  file: file.path,
  start: 1,
  end: 1,
  title: 'Change the value',
  group: 'Core',
  body: 'The value becomes two.',
};
const plan = { title: 'Value change', summary: 'Updates the value.', stops: [stop] };

function setup() {
  const files = {
    list: vi.fn().mockResolvedValue({ ...input, files: [file] }),
    getDescription: vi.fn().mockResolvedValue('Update the value'),
    getDiff: vi.fn().mockResolvedValue(diff),
  };
  const run = vi
    .fn<(prompt: string, schema: unknown, provider: string) => Promise<unknown>>()
    .mockImplementation((_prompt, schema) =>
      Promise.resolve(
        schema === tourOutlineSchema
          ? plan
          : { summary: plan.summary, bodies: plan.stops.map((stop) => stop.body) },
      ),
    );
  return { files, run, tours: new Tours(files, run) };
}

describe('PR tours', () => {
  it.each(['claude', 'codex'] as const)(
    'routes generation and follow-ups to %s',
    async (provider) => {
      const { tours, run } = setup();
      await tours.start({ ...input, provider });
      expect(run.mock.calls[0]?.[2]).toBe(provider);
      run.mockClear();
      run.mockResolvedValue({ answer: 'Details' });
      await tours.ask({ ...input, provider, stop, question: 'Why?' });
      expect(run.mock.calls[0]?.[2]).toBe(provider);
    },
  );

  it('rejects unsupported providers at the IPC boundary', () => {
    expect(startTourInputSchema.safeParse({ ...input, provider: 'unsupported' }).success).toBe(
      false,
    );
  });
  it.each(['overview', 'normal', 'deep'] as const)(
    'uses the selected %s depth in the agent prompt',
    async (depth) => {
      const { tours, run } = setup();
      await tours.start({ ...input, depth });
      expect(run.mock.calls[0]?.[0]).not.toContain(`Explanation depth: ${depth}`);
      expect(run.mock.calls[1]?.[0]).toContain(`Explanation depth: ${depth}`);
      expect(run.mock.calls[1]?.[0]).toContain('Depth changes explanation text only');
    },
  );

  it('uses an existing stop list without asking the provider to choose files again', async () => {
    const { tours, run } = setup();
    expect(await tours.start({ ...input, depth: 'deep' }, plan)).toEqual(plan);
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toContain('Fixed tour stops');
  });

  it.each([{ bodies: [] }, { bodies: ['One', 'Extra'] }])(
    'rejects explanations that add or remove stops',
    async ({ bodies }) => {
      const { tours, run } = setup();
      run.mockResolvedValue({ summary: 'Summary', bodies });
      await expect(tours.start(input, plan)).rejects.toThrow();
    },
  );

  it('rejects unsupported depth values at the IPC boundary', () => {
    expect(startTourInputSchema.safeParse({ ...input, depth: 'unsupported' }).success).toBe(false);
  });

  it('uses the requested snapshot and numbered old/new code', async () => {
    const { tours, files, run } = setup();
    expect(await tours.start(input)).toEqual(plan);
    expect(files.getDiff).toHaveBeenCalledWith(1, input.headSha, input.mergeBase, file.path, null);
    const prompt = run.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('1: const a = 1;');
    expect(prompt).toContain('1: const a = 2;');
    expect(prompt).toContain('Update the value');
  });

  it('rejects a moved head or base before invoking the agent', async () => {
    for (const field of ['headSha', 'mergeBase']) {
      const { tours, files, run } = setup();
      files.list.mockResolvedValue({ ...input, [field]: 'd'.repeat(40), files: [file] });
      await expect(tours.start(input)).rejects.toThrow('PR changed');
      expect(run).not.toHaveBeenCalled();
    }
  });

  it('rejects fabricated files and out of bounds line ranges', async () => {
    for (const invalid of [{ file: '../secret' }, { end: 9999 }, { start: 2, end: 1 }]) {
      const { tours, run } = setup();
      run.mockResolvedValue({ ...plan, stops: [{ ...stop, ...invalid }] });
      await expect(tours.start(input)).rejects.toThrow('invalid file or line');
    }
  });

  it('reports binary-only PRs without calling the agent', async () => {
    const { tours, files, run } = setup();
    files.getDiff.mockResolvedValue({ ...diff, unavailable: 'binary' });
    await expect(tours.start(input)).rejects.toThrow('no text changes');
    expect(run).not.toHaveBeenCalled();
  });

  it('bounds large excerpts while preserving the original line numbers', () => {
    const large = Array.from({ length: 10_000 }, (_, i) => `line ${i + 1}`).join('\n');
    const text = tourCode(
      {
        ...file,
        hunks: [
          { originalStart: 500, originalCount: 1000, modifiedStart: 500, modifiedCount: 1000 },
        ],
      },
      { ...diff, original: large, modified: large },
    );
    expect(text).toContain('500: line 500');
    expect(text).not.toContain('1000: line 1000');
    expect(text.length).toBeLessThanOrEqual(12_000);
  });

  it('answers about a stop using the pinned file and question', async () => {
    const { tours, run } = setup();
    run.mockResolvedValue({ answer: 'It now uses two.' });
    expect(await tours.ask({ ...input, stop, question: 'Why?' })).toBe('It now uses two.');
    expect(run.mock.calls[0]?.[0]).toContain('Reviewer question: Why?');
    expect(run.mock.calls[0]?.[0]).toContain('1: const a = 2;');
  });

  it('rejects questions about files outside the PR', async () => {
    const { tours, run } = setup();
    await expect(
      tours.ask({ ...input, stop: { ...stop, file: 'secret' }, question: 'Explain' }),
    ).rejects.toThrow('no longer in the PR');
    expect(run).not.toHaveBeenCalled();
  });
});
