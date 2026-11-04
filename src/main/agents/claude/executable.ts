import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// The oldest Claude Code checked with PReview's SDK and sandbox settings. Claude Code enforces
// those settings itself, so an older one could leave an agent less confined.
export const MIN_CLAUDE_VERSION = '2.1.288';

export const NOT_INSTALLED =
  'Claude Code is not installed. Run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.';

// Claude Code to run, or what the user has to fix first.
export type ClaudeSetup = { executable: string } | { problem: string };

// What is wrong with the output of `claude --version`, or null when it's new enough. Output
// that can't be read counts as too old.
export function versionProblem(output: string): string | null {
  const found = /(\d+)\.(\d+)\.(\d+)/.exec(output);
  const version = found?.slice(1).map(Number) ?? [];
  const minimum = MIN_CLAUDE_VERSION.split('.').map(Number);
  const newEnough = found !== null && compare(version, minimum) >= 0;
  if (newEnough) return null;
  return `PReview needs Claude Code ${MIN_CLAUDE_VERSION} or newer${found ? `, and found ${found[0]}` : ''}. Run \`claude update\` in a terminal.`;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < b.length; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

// The last line of a shell's output, when it's an absolute path. A shell's startup files can
// print other lines first, and `command -v` prints an alias's definition instead of a path.
export function pathFromShell(output: string): string | undefined {
  const line = output.trim().split('\n').at(-1)?.trim();
  return line?.startsWith('/') ? line : undefined;
}

export interface FindClaudeDeps {
  run: (file: string, args: string[]) => Promise<{ stdout: string }>;
  isExecutable: (path: string) => Promise<boolean>;
  shell: string | undefined;
  home: string;
}

const defaultDeps = (): FindClaudeDeps => ({
  // Startup files run here, so they get a time limit. cwd keeps a pull request's files out of it.
  run: (file, args) => execFileAsync(file, args, { cwd: homedir(), timeout: 15_000 }),
  isExecutable: (path) =>
    access(path, constants.X_OK).then(
      () => true,
      () => false,
    ),
  shell: process.env.SHELL,
  home: homedir(),
});

// Finds the user's own Claude Code on macOS. An app opened from Finder doesn't get the
// terminal's PATH, so it asks the user's shell, then looks where the installers put it.
export async function findClaude(deps: FindClaudeDeps = defaultDeps()): Promise<ClaudeSetup> {
  const { run, isExecutable, shell, home } = deps;
  const fromShell = await run(shell ?? '/bin/zsh', ['-ilc', 'command -v claude']).then(
    ({ stdout }) => pathFromShell(stdout),
    () => undefined,
  );
  const candidates = [
    ...(fromShell ? [fromShell] : []),
    `${home}/.local/bin/claude`,
    `${home}/.claude/local/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  for (const executable of candidates) {
    if (!(await isExecutable(executable))) continue;
    const { stdout } = await run(executable, ['--version']);
    const problem = versionProblem(stdout);
    return problem ? { problem } : { executable };
  }
  return { problem: NOT_INSTALLED };
}
