import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { linuxClaudeExecutable } from './executable.ts';
import { prepareIsolation, type Isolation } from './isolation.ts';
import { baseOptions } from './sdk.ts';
import { checkWsl, fromWslPath, prepareWslIsolation, wslSpawner } from './wsl.ts';

// Where Claude Code runs. macOS runs it directly. Windows runs its Linux build inside WSL.
export interface ClaudeRuntime {
  options: (cwd: string) => Options;
  // What the user has to fix before Claude Code can run, or null.
  check: () => Promise<string | null>;
  isolate: (worktree: string) => Promise<Isolation>;
  // Turns a path Claude Code names into one on this machine.
  localPath: (path: string) => string;
  // How to sign in to Claude where Claude Code runs.
  signInHint: string;
}

export function claudeRuntime(
  isPackaged: boolean,
  wslDistro: string,
  platform: NodeJS.Platform = process.platform,
): ClaudeRuntime {
  if (platform !== 'win32') {
    return {
      options: (cwd) => baseOptions(isPackaged, cwd),
      check: () => Promise.resolve(null),
      isolate: prepareIsolation,
      localPath: (path) => path,
      signInHint: 'Run `claude` in a terminal and use /login.',
    };
  }
  return {
    options: (cwd) => ({
      ...baseOptions(isPackaged, cwd),
      pathToClaudeCodeExecutable: linuxClaudeExecutable(isPackaged),
      spawnClaudeCodeProcess: wslSpawner(wslDistro),
    }),
    check: () => checkWsl(wslDistro),
    isolate: (worktree) => prepareWslIsolation(worktree, wslDistro),
    localPath: fromWslPath,
    // WSL keeps its own Claude login, apart from the one on Windows.
    signInHint: `Run \`claude\` in ${wslDistro} (WSL) and use /login.`,
  };
}
