import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { dirname } from 'node:path';
import { findClaude, type ClaudeSetup } from './executable.ts';
import { prepareIsolation, type Isolation } from './isolation.ts';
import { baseOptions } from './sdk.ts';
import { checkWsl, findWslClaude, fromWslPath, prepareWslIsolation, wslSpawner } from './wsl.ts';

// Where the user's Claude Code runs. macOS runs it directly. Windows runs the Linux one they
// installed inside WSL.
export interface ClaudeRuntime {
  options: (cwd: string, executable: string) => Options;
  // Finds Claude Code, or says what the user has to fix first.
  setup: () => Promise<ClaudeSetup>;
  isolate: (worktree: string) => Promise<Isolation>;
  // Turns a path Claude Code names into one on this machine.
  localPath: (path: string) => string;
  // How to sign in to Claude where Claude Code runs.
  signInHint: string;
}

export function claudeRuntime(
  wslDistro: string,
  platform: NodeJS.Platform = process.platform,
): ClaudeRuntime {
  if (platform !== 'win32') {
    return {
      options: (cwd, executable) => {
        const options = baseOptions(cwd, executable);
        // Claude Code installed with npm starts with `node`, which is usually beside it. The
        // app's own PATH may not have that folder.
        const path = [dirname(executable), options.env?.PATH].filter(Boolean).join(':');
        return { ...options, env: { ...options.env, PATH: path } };
      },
      setup: () => findClaude(),
      isolate: prepareIsolation,
      localPath: (path) => path,
      signInHint: 'Run `claude` in a terminal and use /login.',
    };
  }
  return {
    options: (cwd, executable) => ({
      ...baseOptions(cwd, executable),
      spawnClaudeCodeProcess: wslSpawner(wslDistro),
    }),
    setup: async () => {
      const problem = await checkWsl(wslDistro);
      return problem ? { problem } : findWslClaude(wslDistro);
    },
    isolate: (worktree) => prepareWslIsolation(worktree, wslDistro),
    localPath: fromWslPath,
    // WSL keeps its own Claude login, apart from the one on Windows.
    signInHint: `Run \`claude\` in ${wslDistro} (WSL) and use /login.`,
  };
}
