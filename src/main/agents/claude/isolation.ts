import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, posix } from 'node:path';

export type Sandbox = NonNullable<Options['sandbox']>;

// The OS sandbox for the agent's shell commands, plus the variables that point them at a
// private temp folder. close() removes that folder.
export interface Isolation {
  env: Record<string, string>;
  sandbox: Sandbox;
  close: () => Promise<void>;
}

// The only hosts shell commands can reach, so agents can install a project's dependencies.
// Install scripts run inside the sandbox like any other command.
export const PACKAGE_REGISTRIES = [
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'repo.yarnpkg.com',
];

// Shell commands can write only in the worktree and the temp folder, can't change the
// worktree's Git link, can't read the home folder outside those two, and reach only the
// package registries.
// macOS enforces it with Seatbelt. Windows runs Claude Code inside WSL, where bubblewrap does.
// Paths are POSIX on both.
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
      denyWrite: [posix.join(worktree, '.git')],
    },
    network: {
      allowedDomains: PACKAGE_REGISTRIES,
      strictAllowlist: true,
      allowLocalBinding: false,
    },
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
    env: {
      CLAUDE_CODE_TMPDIR: temp,
      TMPDIR: temp,
      TMP: temp,
      TEMP: temp,
      // Package managers keep their caches in the home folder, which commands can't write.
      npm_config_cache: join(temp, 'npm'),
      npm_config_update_notifier: 'false',
      // The user's .npmrc can hold registry tokens, and commands can't read it anyway.
      npm_config_userconfig: join(temp, 'npmrc'),
      PNPM_HOME: join(temp, 'pnpm'),
      YARN_CACHE_FOLDER: join(temp, 'yarn'),
      COREPACK_HOME: join(temp, 'corepack'),
      BUN_INSTALL_CACHE_DIR: join(temp, 'bun'),
    },
    sandbox: sandboxFor(root, temp, await realpath(homedir())),
    close: () => rm(temp, { recursive: true, force: true }),
  };
}
