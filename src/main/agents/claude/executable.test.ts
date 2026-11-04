import { describe, expect, it, vi } from 'vitest';
import {
  findClaude,
  MIN_CLAUDE_VERSION,
  NOT_INSTALLED,
  pathFromShell,
  versionProblem,
  type FindClaudeDeps,
} from './executable.ts';

const home = '/Users/me';
const SHELL = '/bin/zsh';

// A machine with these executables. shellOutput is what the shell prints, or undefined to fail.
function machine(
  versions: Record<string, string>,
  shellOutput?: string,
): FindClaudeDeps & { run: ReturnType<typeof vi.fn<FindClaudeDeps['run']>> } {
  return {
    home,
    shell: SHELL,
    isExecutable: (path) => Promise.resolve(path in versions),
    run: vi.fn<FindClaudeDeps['run']>((file) => {
      const stdout = file === SHELL ? shellOutput : versions[file];
      return stdout === undefined
        ? Promise.reject(new Error('failed'))
        : Promise.resolve({ stdout });
    }),
  };
}

describe('versionProblem', () => {
  it('accepts the minimum and newer', () => {
    expect(versionProblem(`${MIN_CLAUDE_VERSION} (Claude Code)`)).toBeNull();
    expect(versionProblem('2.2.0 (Claude Code)')).toBeNull();
    expect(versionProblem('3.0.0 (Claude Code)')).toBeNull();
  });

  it('refuses older versions and output it cannot read', () => {
    expect(versionProblem('2.1.287 (Claude Code)')).toContain('found 2.1.287');
    expect(versionProblem('2.0.999 (Claude Code)')).toContain('claude update');
    expect(versionProblem('command not found')).toContain(MIN_CLAUDE_VERSION);
  });
});

describe('pathFromShell', () => {
  it('reads the last line, past what startup files print', () => {
    expect(pathFromShell('Welcome back\n/opt/bin/claude\n')).toBe('/opt/bin/claude');
  });

  it('ignores an alias', () => {
    expect(pathFromShell('alias claude=/Users/me/.claude/local/claude\n')).toBeUndefined();
  });
});

describe('findClaude', () => {
  it('prefers the one the shell finds', async () => {
    const deps = machine(
      {
        '/Users/me/.nvm/bin/claude': '2.1.300 (Claude Code)',
        '/Users/me/.local/bin/claude': '2.1.290 (Claude Code)',
      },
      '/Users/me/.nvm/bin/claude\n',
    );
    await expect(findClaude(deps)).resolves.toEqual({ executable: '/Users/me/.nvm/bin/claude' });
  });

  it('looks where the installers put it when the shell finds nothing', async () => {
    const deps = machine({ '/opt/homebrew/bin/claude': '2.1.300 (Claude Code)' });
    await expect(findClaude(deps)).resolves.toEqual({ executable: '/opt/homebrew/bin/claude' });
  });

  it('says when it is not installed', async () => {
    await expect(findClaude(machine({}))).resolves.toEqual({ problem: NOT_INSTALLED });
  });

  it('refuses a version that is too old', async () => {
    const deps = machine({ '/Users/me/.local/bin/claude': '1.0.0 (Claude Code)' });
    await expect(findClaude(deps)).resolves.toEqual({
      problem: expect.stringContaining('found 1.0.0') as string,
    });
  });
});
