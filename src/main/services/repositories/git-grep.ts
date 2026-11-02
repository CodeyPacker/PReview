import { spawn } from 'node:child_process';

// Runs git grep in a folder and resolves with its first maxLines lines of output. Stops git
// once it has them, so a common word in a large repository doesn't fill memory. No matches
// is an empty list.
export type GitGrep = (cwd: string, args: string[], maxLines: number) => Promise<string[]>;

const TIMEOUT_MS = 20_000;

export const runGitGrep: GitGrep = (cwd, args, maxLines) =>
  new Promise((resolve, reject) => {
    const child = spawn('git', ['grep', ...args], { cwd, windowsHide: true });
    const lines: string[] = [];
    let partial = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(lines);
    };
    const timer = setTimeout(() => finish(new Error('git grep took too long.')), TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      const parts = (partial + chunk).split('\n');
      partial = parts.pop() ?? '';
      for (const line of parts) {
        lines.push(line);
        if (lines.length >= maxLines) return finish();
      }
    });
    child.on('error', finish);
    // Exit code 1 means nothing matched. Anything above that is a failure.
    child.on('close', (code) => {
      if (partial) lines.push(partial);
      finish(
        code !== null && code > 1 ? new Error(`git grep failed with code ${code}.`) : undefined,
      );
    });
  });
