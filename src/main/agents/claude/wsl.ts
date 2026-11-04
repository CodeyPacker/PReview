// TEMPORARY (WSL spike). Runs Claude Code's Linux binary inside WSL from Windows PReview.
import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Isolation } from './isolation.ts';
import { sandboxFor } from './isolation.ts';

const execFileAsync = promisify(execFile);

// C:\Users\me\x → /mnt/c/Users/me/x. WSL mounts each drive there by default.
export function toWslPath(path: string): string {
  const match = /^([A-Za-z]):[\\/]?(.*)$/.exec(path);
  if (!match) throw new Error(`Not a Windows drive path: ${path}`);
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replace(/\\/g, '/')}`.replace(/\/$/, '');
}

// /mnt/c/Users/me/x → C:\Users\me/x. Other Linux paths are left as they are, so they land
// outside the worktree.
export function fromWslPath(path: string): string {
  const match = /^\/mnt\/([a-z])(\/.*)?$/.exec(path);
  return match ? `${match[1]!.toUpperCase()}:${(match[2] ?? '/').replace(/\//g, '\\')}` : path;
}

// Windows variables that mean nothing inside Linux, or point at Windows folders.
const WINDOWS_ONLY = new Set([
  'PATH',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'OS',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
  'SHELL',
  'USER',
  'LOGNAME',
  'TERM',
]);

// The Linux binary from the SDK's linux-x64 package, shipped next to the Windows one.
export function linuxClaudeExecutable(resourcesPath: string, isPackaged: boolean): string {
  const name = '@anthropic-ai/claude-agent-sdk-linux-x64';
  const modules = isPackaged
    ? join(resourcesPath, 'app.asar.unpacked', 'node_modules')
    : join(process.cwd(), 'node_modules');
  const found = [
    join(modules, name, 'claude'),
    join(modules, '@anthropic-ai', 'claude-agent-sdk', 'node_modules', name, 'claude'),
  ].find((path) => existsSync(path));
  if (!found) throw new Error(`The Linux Claude Code binary is missing under ${modules}`);
  return found;
}

// Starts the SDK's command in WSL: Windows paths become /mnt paths, and only the variables
// Claude Code needs cross over. WSL itself sets HOME, USER, SHELL and PATH.
export function wslSpawner(distro?: string) {
  return (options: SpawnOptions): SpawnedProcess => {
    const env = Object.entries(options.env)
      .filter(([key, value]) => value !== undefined && !WINDOWS_ONLY.has(key.toUpperCase()))
      .map(([key, value]) => `${key}=${value}`);
    const args = [
      ...(distro ? ['-d', distro] : []),
      ...(options.cwd ? ['--cd', toWslPath(options.cwd)] : []),
      '--exec',
      '/usr/bin/env',
      ...env,
      toWslPath(options.command),
      ...options.args,
    ];
    return spawn('wsl.exe', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      signal: options.signal,
    });
  };
}

async function wslRun(distro: string | undefined, command: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    'wsl.exe',
    [...(distro ? ['-d', distro] : []), '--exec', ...command],
    { windowsHide: true },
  );
  return stdout.trim();
}

// The same rules as on macOS, in WSL's paths. Both home folders stay unreadable: WSL's own and
// the Windows one under /mnt/c.
// The temp folder lives in Linux's /tmp. The sandbox opens Unix sockets there, and /mnt/c
// doesn't support them.
export async function prepareWslIsolation(worktree: string, distro?: string): Promise<Isolation> {
  const linuxTemp = await wslRun(distro, ['mktemp', '-d', '/tmp/pv-XXXXXX']);
  const linuxWorktree = toWslPath(await realpath(worktree));
  const sandbox = sandboxFor(
    linuxWorktree,
    linuxTemp,
    await wslRun(distro, ['sh', '-c', 'printf %s "$HOME"']),
  );
  sandbox.filesystem = {
    ...sandbox.filesystem,
    denyRead: [...(sandbox.filesystem?.denyRead ?? []), toWslPath(homedir())],
    // sandboxFor joins with Windows separators here.
    denyWrite: [`${linuxWorktree}/.git`],
  };
  return {
    env: {
      CLAUDE_CODE_TMPDIR: linuxTemp,
      TMPDIR: linuxTemp,
      npm_config_update_notifier: 'false',
      npm_config_userconfig: `${linuxTemp}/npmrc`,
      npm_config_cache: `${linuxTemp}/npm`,
      PNPM_HOME: `${linuxTemp}/pnpm`,
      YARN_CACHE_FOLDER: `${linuxTemp}/yarn`,
      COREPACK_HOME: `${linuxTemp}/corepack`,
      BUN_INSTALL_CACHE_DIR: `${linuxTemp}/bun`,
    },
    sandbox,
    close: () => wslRun(distro, ['rm', '-rf', linuxTemp]).then(() => {}),
  };
}
