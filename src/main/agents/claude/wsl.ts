// On Windows, the user's Claude Code runs inside WSL, where Linux's sandbox (bubblewrap and
// socat) confines its shell commands.
import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import { execFile, spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { NOT_INSTALLED, pathFromShell, versionProblem, type ClaudeSetup } from './executable.ts';
import type { Isolation } from './isolation.ts';
import { sandboxFor } from './isolation.ts';

// Runs a program and resolves with its output. Rejects like execFile when it fails.
export type Exec = (file: string, args: string[]) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile);
const exec: Exec = (file, args) =>
  execFileAsync(file, args, { windowsHide: true, timeout: 30_000 });

// C:\Users\me\x → /mnt/c/Users/me/x. WSL mounts each drive there by default.
export function toWslPath(path: string): string {
  const match = /^([A-Za-z]):[\\/]?(.*)$/.exec(path);
  if (!match) throw new Error(`Not a Windows drive path: ${path}`);
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replace(/\\/g, '/')}`.replace(/\/$/, '');
}

// /mnt/c/Users/me/x → C:\Users\me\x. Other Linux paths are left as they are, so they land
// outside the worktree.
export function fromWslPath(path: string): string {
  const match = /^\/mnt\/([a-z])(\/.*)?$/.exec(path);
  return match ? `${match[1]!.toUpperCase()}:${(match[2] ?? '/').replace(/\//g, '\\')}` : path;
}

// Windows variables that mean nothing inside Linux, or point at Windows folders.
const WINDOWS_ONLY = new Set([
  'PATH',
  'HOME',
  'TMP',
  'TEMP',
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

// The arguments that start the SDK's command in WSL. The command is already a Linux path, and
// only the variables Claude Code needs cross over. WSL itself sets HOME, USER, SHELL and PATH.
export function wslArgs(distro: string, options: SpawnOptions): string[] {
  const env = Object.entries(options.env)
    .filter(([key, value]) => value !== undefined && !WINDOWS_ONLY.has(key.toUpperCase()))
    .map(([key, value]) => `${key}=${value}`);
  return [
    '-d',
    distro,
    ...(options.cwd ? ['--cd', toWslPath(options.cwd)] : []),
    '--exec',
    '/usr/bin/env',
    ...env,
    options.command,
    ...options.args,
  ];
}

export function wslSpawner(distro: string) {
  return (options: SpawnOptions): SpawnedProcess =>
    spawn('wsl.exe', wslArgs(distro, options), {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      signal: options.signal,
    });
}

async function wslRun(distro: string, command: string[], run: Exec): Promise<string> {
  const { stdout } = await run('wsl.exe', ['-d', distro, '--exec', ...command]);
  return stdout.trim();
}

// wsl.exe writes its own messages in UTF-16, which read as text with a NUL after each letter.
const outputOf = (error: unknown): string => {
  const { stdout, stderr } = error as { stdout?: unknown; stderr?: unknown };
  return [stdout, stderr]
    .map((part) => (typeof part === 'string' ? part : ''))
    .join('\n')
    .replace(/\0/g, '')
    .trim();
};

// What the user has to fix before agents can run in `distro`, or null when it's ready.
export async function checkWsl(distro: string, run: Exec = exec): Promise<string | null> {
  try {
    await wslRun(distro, ['sh', '-c', 'command -v bwrap && command -v socat'], run);
    return null;
  } catch (error) {
    const { code } = error as { code?: unknown };
    if (code === 'ENOENT') {
      return 'WSL is not installed. Run `wsl --install -d Ubuntu` in PowerShell, then restart PReview.';
    }
    const output = outputOf(error);
    if (/DISTRO_NOT_FOUND|no distribution/i.test(output)) {
      return `WSL has no distribution named ${distro} for this Windows user. Run \`wsl --install -d ${distro}\` in PowerShell, or change the distribution in Settings.`;
    }
    // `command -v` exits with 1 when a tool is missing.
    if (code === 1) {
      return `The sandbox tools are missing in ${distro}. Run \`sudo apt install -y bubblewrap socat\` in ${distro}.`;
    }
    return `WSL could not start ${distro}: ${output || (error instanceof Error ? error.message : String(error))}`;
  }
}

// Where the installers put Claude Code, for a shell whose startup files don't add it to PATH.
const FIND_INSTALLED = `for path in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /usr/local/bin/claude; do
  if [ -x "$path" ]; then echo "$path"; exit 0; fi
done
exit 1`;

// Finds the Claude Code installed in `distro`. WSL's PATH also holds Windows folders, so one
// under /mnt is the Windows install, which can't run the Linux sandbox.
export async function findWslClaude(distro: string, run: Exec = exec): Promise<ClaudeSetup> {
  const onPath = await wslRun(distro, ['bash', '-ilc', 'command -v claude'], run).then(
    pathFromShell,
    () => undefined,
  );
  const executable =
    onPath && !onPath.startsWith('/mnt/')
      ? onPath
      : await wslRun(distro, ['sh', '-c', FIND_INSTALLED], run).catch(() => undefined);
  if (!executable) return { problem: NOT_INSTALLED.replace('a terminal', distro) };
  const problem = versionProblem(await wslRun(distro, [executable, '--version'], run));
  return problem ? { problem } : { executable };
}

// The same rules as on macOS, in WSL's paths. Both home folders stay unreadable: WSL's own and
// the Windows one under /mnt/c.
// The temp folder lives in Linux's /tmp. The sandbox opens Unix sockets there, and /mnt/c
// doesn't support them.
export async function prepareWslIsolation(
  worktree: string,
  distro: string,
  run: Exec = exec,
): Promise<Isolation> {
  const temp = await wslRun(distro, ['mktemp', '-d', '/tmp/pv-XXXXXX'], run);
  const sandbox = sandboxFor(
    toWslPath(await realpath(worktree)),
    temp,
    await wslRun(distro, ['sh', '-c', 'printf %s "$HOME"'], run),
  );
  sandbox.filesystem = {
    ...sandbox.filesystem,
    denyRead: [...(sandbox.filesystem?.denyRead ?? []), toWslPath(homedir())],
  };
  return {
    env: {
      CLAUDE_CODE_TMPDIR: temp,
      TMPDIR: temp,
      npm_config_cache: `${temp}/npm`,
      npm_config_update_notifier: 'false',
      npm_config_userconfig: `${temp}/npmrc`,
      PNPM_HOME: `${temp}/pnpm`,
      YARN_CACHE_FOLDER: `${temp}/yarn`,
      COREPACK_HOME: `${temp}/corepack`,
      BUN_INSTALL_CACHE_DIR: `${temp}/bun`,
    },
    sandbox,
    close: () => wslRun(distro, ['rm', '-rf', temp], run).then(() => {}),
  };
}
