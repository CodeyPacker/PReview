import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export type Sandbox = NonNullable<Options['sandbox']>;

// The OS sandbox for the agent's shell commands, plus the variables that point them at a
// private temp folder. close() removes that folder.
export interface Isolation {
  env: Record<string, string>;
  sandbox: Sandbox;
  close: () => Promise<void>;
}

// Shell commands can write only in the worktree and the temp folder, can't change the
// worktree's Git link, can't read the home folder outside those two, and have no network.
// macOS enforces it with Seatbelt. Windows runs the commands as a separate user with no
// rights of its own.
export function sandboxFor(worktree: string, temp: string, home: string): Sandbox {
  return {
    enabled: true,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    filesystem: {
      denyRead: [home],
      allowRead: [worktree, temp],
      allowWrite: [worktree, temp],
      denyWrite: [join(worktree, '.git')],
    },
    network: { allowedDomains: [], strictAllowlist: true, allowLocalBinding: false },
  };
}

// A short temp root on macOS, since Claude Code falls back to a shared folder for long paths.
function tempRoot(): string {
  return process.platform === 'darwin' ? '/private/tmp' : tmpdir();
}

export async function prepareIsolation(worktree: string): Promise<Isolation> {
  const root = await realpath(worktree);
  const temp = await realpath(await mkdtemp(join(tempRoot(), 'pv-')));
  return {
    env: { CLAUDE_CODE_TMPDIR: temp, TMPDIR: temp, TMP: temp, TEMP: temp },
    sandbox: sandboxFor(root, temp, await realpath(homedir())),
    close: () => rm(temp, { recursive: true, force: true }),
  };
}
