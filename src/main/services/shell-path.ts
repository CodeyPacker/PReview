import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Marks the line with the PATH, since a shell's startup files can print other lines.
const MARKER = '__PREVIEW_PATH__';

export interface ShellPathDeps {
  run: (file: string, args: string[]) => Promise<{ stdout: string }>;
  shell: string | undefined;
  home: string;
  current: string | undefined;
}

const defaultDeps = (): ShellPathDeps => ({
  // Startup files run here, so they get a time limit.
  run: (file, args) => execFileAsync(file, args, { cwd: homedir(), timeout: 10_000 }),
  shell: process.env.SHELL,
  home: homedir(),
  current: process.env.PATH,
});

// The PATH the user has in a terminal. An app opened from Finder gets only the system folders,
// so it wouldn't find tools such as gh. Where installers put tools is always included, in case
// the shell can't answer.
export async function shellPath(deps: ShellPathDeps = defaultDeps()): Promise<string> {
  const { run, shell, home, current } = deps;
  const fromShell = await run(shell ?? '/bin/zsh', ['-ilc', `printf '\\n${MARKER}%s\\n' "$PATH"`])
    .then(({ stdout }) =>
      stdout
        .split('\n')
        .find((line) => line.startsWith(MARKER))
        ?.slice(MARKER.length),
    )
    .catch(() => undefined);
  const folders = [
    ...(fromShell?.split(':') ?? []),
    ...(current?.split(':') ?? []),
    `${home}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  return [...new Set(folders.filter(Boolean))].join(':');
}
