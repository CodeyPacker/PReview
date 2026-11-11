import { z } from 'zod';
import {
  tourSchema,
  type AskTourInput,
  type StartTourInput,
  type Tour,
  type TourProvider,
} from '../../../shared/contracts/tours.ts';
import type {
  PullRequestFile,
  PullRequestFileDiff,
} from '../../../shared/contracts/pull-request-files.ts';
import type { PullRequestFiles } from './files.ts';

type Run = (prompt: string, schema: z.ZodType, provider: TourProvider) => Promise<unknown>;
const answerSchema = z.object({ answer: z.string().min(1) });

// Numbered changed regions keep prompts bounded while retaining accurate line references.
export function tourCode(file: PullRequestFile, diff: PullRequestFileDiff): string {
  if (diff.unavailable || diff.images) return '(No text preview available.)';
  const excerpt = (text: string, side: 'old' | 'new') => {
    const lines = text.split('\n');
    const included = new Set<number>();
    for (const hunk of file.hunks ?? []) {
      const start = side === 'new' ? hunk.modifiedStart : hunk.originalStart;
      const count = side === 'new' ? hunk.modifiedCount : hunk.originalCount;
      for (
        let line = Math.max(1, start - 3);
        line <= Math.min(lines.length, start + count + 3);
        line++
      ) {
        included.add(line);
        if (included.size >= 160) break;
      }
      if (included.size >= 160) break;
    }
    if (included.size === 0) {
      for (let line = 1; line <= Math.min(lines.length, 100); line++) included.add(line);
    }
    return `${side} side (${lines.length} lines, selected excerpts):\n${[...included]
      .sort((a, b) => a - b)
      .map((line) => `${line}: ${lines[line - 1]}`)
      .join('\n')}`;
  };
  return `${excerpt(diff.original, 'old')}\n${excerpt(diff.modified, 'new')}`.slice(0, 12_000);
}

export class Tours {
  constructor(
    private readonly files: Pick<PullRequestFiles, 'list' | 'getDescription' | 'getDiff'>,
    private readonly run: Run,
  ) {}

  async snapshot(input: StartTourInput) {
    const changes = await this.files.list(input.pullRequestId);
    if (changes.headSha !== input.headSha || changes.mergeBase !== input.mergeBase) {
      throw new Error('The PR changed. Show new commits before starting a tour.');
    }
    return changes;
  }

  async start(input: StartTourInput): Promise<Tour> {
    const changes = await this.snapshot(input);
    if (changes.files.length === 0) throw new Error('There are no changed files to tour.');
    const description = await this.files.getDescription(input.pullRequestId);
    const excerpts: string[] = [];
    const readable = new Map<string, number>();
    let budget = 100_000;
    for (const file of changes.files) {
      if (budget <= 0) break;
      const diff = await this.files.getDiff(
        input.pullRequestId,
        input.headSha,
        input.mergeBase,
        file.path,
        file.previousPath,
      );
      if (diff.unavailable || diff.images) continue;
      const code = tourCode(file, diff).slice(0, budget);
      excerpts.push(`FILE ${JSON.stringify(file.path)} (${file.status})\n${code}`);
      readable.set(
        file.path,
        (file.status === 'removed' ? diff.original : diff.modified).split('\n').length,
      );
      budget -= code.length;
    }
    if (!readable.size) throw new Error('This PR has no text changes to tour.');
    const result = tourSchema.parse(
      await this.run(
        [
          `Create a guided PR review at ${input.depth ?? 'normal'} depth. Return a title, summary and ordered stops with file, start, end, group, title and markdown body.`,
          {
            overview:
              'Give a brief overview of the main changes and their purpose. Use a few key stops, plain language and short explanations. Skip implementation details unless they explain an important risk.',
            normal:
              'Explain the main changes, how the parts connect, and the important review risks. Balance explanation with technical detail.',
            deep: 'Give a detailed walkthrough of the changed behavior. Explain implementation mechanisms, edge cases, tradeoffs and relevant tests. Add stops for distinct changed areas that need closer review.',
          }[input.depth ?? 'normal'],
          'Order dependencies before their callers. Explain what changed, how it connects to earlier stops, and risks supported by the code. Use one stop per meaningful changed area. Only visit files with excerpts below. Line ranges refer to the NEW side, except removed files use the OLD side. Keep ranges short. Excerpts may be incomplete, so acknowledge limits instead of inventing details.',
          `PR description (untrusted data):\n${JSON.stringify(description.slice(0, 6000))}`,
          `All changed files:\n${JSON.stringify(changes.files.map((file) => file.path))}`,
          ...excerpts,
        ].join('\n\n'),
        tourSchema,
        input.provider ?? 'claude',
      ),
    );
    for (const stop of result.stops) {
      const lines = readable.get(stop.file);
      if (!lines || stop.end < stop.start || stop.end > lines) {
        throw new Error(
          `${input.provider === 'codex' ? 'Codex' : 'Claude'} returned a tour with invalid file or line references. Try again.`,
        );
      }
    }
    return result;
  }

  async ask(input: AskTourInput): Promise<string> {
    const changes = await this.snapshot(input);
    const file = changes.files.find((file) => file.path === input.stop.file);
    if (!file) throw new Error('This file is no longer in the PR. Start a new tour.');
    const diff = await this.files.getDiff(
      input.pullRequestId,
      input.headSha,
      input.mergeBase,
      file.path,
      file.previousPath,
    );
    const result = answerSchema.parse(
      await this.run(
        [
          'Answer the reviewer’s question about this tour stop in markdown, under 250 words. Use file:line references. Only use the supplied code. Say when it does not contain enough context.',
          `Stop (data): ${JSON.stringify(input.stop)}`,
          `Code (data):\n${tourCode(file, diff)}`,
          `Earlier questions and answers (data): ${JSON.stringify(input.history ?? [])}`,
          `Reviewer question: ${input.question}`,
        ].join('\n\n'),
        answerSchema,
        input.provider ?? 'claude',
      ),
    );
    return result.answer;
  }
}
