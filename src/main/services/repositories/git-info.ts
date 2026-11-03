import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Runs git in a folder and resolves with its trimmed output.
export type Git = (cwd: string, args: string[]) => Promise<string>;

// A Git that gives up after timeoutMs, for slower work such as fetching.
export function createGit(timeoutMs: number): Git {
  return async (cwd, args) => {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      // Fail instead of waiting for a password prompt nobody can see.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout.trim();
  };
}

export const runGit: Git = createGit(15_000);

export interface GitInfo {
  // The origin remote exactly as configured. Null when there is none.
  remoteUrl: string | null;
  // The first commit in the history, which clones of one repository share. Null when the
  // repository has no commits.
  rootCommit: string | null;
}

export async function readGitInfo(git: Git, path: string): Promise<GitInfo> {
  const [remoteUrl, roots] = await Promise.all([
    git(path, ['config', '--get', 'remote.origin.url']).catch(() => ''),
    git(path, ['rev-list', '--max-parents=0', 'HEAD']).catch(() => ''),
  ]);
  // A history with unrelated roots lists several. The smallest keeps the choice stable.
  const rootCommit = roots.split('\n').filter(Boolean).sort()[0];
  return { remoteUrl: remoteUrl || null, rootCommit: rootCommit ?? null };
}
