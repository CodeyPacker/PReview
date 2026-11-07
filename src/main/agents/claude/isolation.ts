import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
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

// Where pnpm puts packages, inside the temp folder. Claude Code's sandbox blocks writes to any
// .vscode or .idea folder in the worktree, and some packages ship one, which fails the install.
// The temp folder has no such block, and node_modules links to the packages there.
export const PNPM_VIRTUAL_STORE = 'pnpm-virtual';

// Downloaded packages stay in this folder between runs, so a run only fetches what's new. Every
// repository shares it, and an agent's commands can write to it, so a bad pull request could
// change a package that later runs use. That's accepted, as PReview only runs on trusted code.
export const PACKAGE_CACHE = 'preview/agent-packages';

// Points package managers at the kept folder. Their usual caches are in the home folder, which
// commands can't write.
export function packageCacheEnv(cache: string): Record<string, string> {
  return {
    npm_config_cache: posix.join(cache, 'npm'),
    npm_config_store_dir: posix.join(cache, 'pnpm-store'),
    YARN_CACHE_FOLDER: posix.join(cache, 'yarn'),
    COREPACK_HOME: posix.join(cache, 'corepack'),
    BUN_INSTALL_CACHE_DIR: posix.join(cache, 'bun'),
  };
}

// Shell commands can write only in the worktree, the temp folder and the package cache, can't
// change the worktree's Git link, can't read the home folder outside those, and reach only the
// package registries.
// macOS enforces it with Seatbelt. Windows runs Claude Code inside WSL, where bubblewrap does.
// Paths are POSIX on both.
export function sandboxFor(worktree: string, temp: string, cache: string, home: string): Sandbox {
  return {
    enabled: true,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    filesystem: {
      denyRead: [home],
      allowRead: [worktree, temp, cache],
      allowWrite: [worktree, temp, cache],
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

function packageCachePath(): string {
  return join(
    homedir(),
    process.platform === 'darwin' ? 'Library/Caches' : '.cache',
    PACKAGE_CACHE,
  );
}

export async function clearPackageCache(cacheFolder = packageCachePath()): Promise<void> {
  await rm(cacheFolder, { recursive: true, force: true });
}

export async function prepareIsolation(
  worktree: string,
  cacheFolder = packageCachePath(),
): Promise<Isolation> {
  const root = await realpath(worktree);
  await mkdir(cacheFolder, { recursive: true });
  const cache = await realpath(cacheFolder);
  const temp = await realpath(await mkdtemp(join(tempRoot(), 'pv-')));
  return {
    env: {
      CLAUDE_CODE_TMPDIR: temp,
      TMPDIR: temp,
      TMP: temp,
      TEMP: temp,
      ...packageCacheEnv(cache),
      npm_config_update_notifier: 'false',
      // The user's .npmrc can hold registry tokens, and commands can't read it anyway.
      npm_config_userconfig: join(temp, 'npmrc'),
      PNPM_HOME: join(temp, 'pnpm'),
      npm_config_virtual_store_dir: join(temp, PNPM_VIRTUAL_STORE),
    },
    sandbox: sandboxFor(root, temp, cache, await realpath(homedir())),
    close: async () => {
      // Its links die with the temp folder. Without it, the next run is told to install again.
      if (existsSync(join(temp, PNPM_VIRTUAL_STORE)))
        await rm(join(root, 'node_modules'), { recursive: true, force: true });
      await rm(temp, { recursive: true, force: true });
    },
  };
}
