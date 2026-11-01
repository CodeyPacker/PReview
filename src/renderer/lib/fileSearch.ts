import type {
  PullRequestFile,
  PullRequestFileDiff,
} from '../../shared/contracts/pull-request-files.ts';

export interface FileSearchMatch {
  side: 'original' | 'modified';
  line: number;
  preview: string;
}

export function matchesFilePath(file: PullRequestFile, query: string): boolean {
  return (
    file.path.toLowerCase().includes(query) ||
    (file.previousPath?.toLowerCase().includes(query) ?? false)
  );
}

export function findFileText(
  diff: PullRequestFileDiff,
  query: string,
): FileSearchMatch | undefined {
  if (diff.unavailable || !query) return undefined;
  for (const side of ['modified', 'original'] as const) {
    const lines = diff[side].split('\n');
    const index = lines.findIndex((line) => line.toLowerCase().includes(query));
    if (index !== -1) return { side, line: index + 1, preview: lines[index]?.trim() ?? '' };
  }
  return undefined;
}

export async function searchChangedFiles(
  files: readonly PullRequestFile[],
  query: string,
  read: (file: PullRequestFile) => Promise<PullRequestFileDiff>,
  signal: AbortSignal,
) {
  const matches = new Map<string, FileSearchMatch>();
  let failed = 0;
  let skipped = 0;
  let index = 0;
  async function worker() {
    while (!signal.aborted && index < files.length) {
      const file = files[index++];
      if (!file || matchesFilePath(file, query)) continue;
      try {
        const diff = await read(file);
        if (signal.aborted) return;
        if (diff.unavailable) skipped++;
        const match = findFileText(diff, query);
        if (match) matches.set(file.path, match);
      } catch {
        if (!signal.aborted) failed++;
      }
      // Cached content can resolve synchronously. Yield so typing can cancel a large search.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
  return { matches, failed, skipped };
}
