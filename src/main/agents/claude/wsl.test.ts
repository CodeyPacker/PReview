import { describe, expect, it, vi } from 'vitest';
import { checkWsl, findWslClaude, fromWslPath, toWslPath, wslArgs, type Exec } from './wsl.ts';

const failure = (fields: Record<string, unknown>) =>
  Object.assign(new Error('Command failed'), fields);

describe('WSL paths', () => {
  it('maps drive paths to and from /mnt', () => {
    expect(toWslPath('C:\\Users\\me\\repo')).toBe('/mnt/c/Users/me/repo');
    expect(toWslPath('D:\\')).toBe('/mnt/d');
    expect(fromWslPath('/mnt/c/Users/me/repo/a.ts')).toBe('C:\\Users\\me\\repo\\a.ts');
  });

  it('leaves Linux-only paths alone, so they fall outside the worktree', () => {
    expect(fromWslPath('/home/me/.ssh/id_rsa')).toBe('/home/me/.ssh/id_rsa');
  });

  it('rejects paths that are not on a drive', () => {
    expect(() => toWslPath('\\\\server\\share')).toThrow('Not a Windows drive path');
  });
});

describe('wslArgs', () => {
  it('runs Claude Code in the distro with only the variables Linux needs', () => {
    const args = wslArgs('Ubuntu', {
      command: '/home/me/.local/bin/claude',
      args: ['--print'],
      cwd: 'C:\\work\\tree',
      env: { Path: 'C:\\Windows', TEMP: 'C:\\Temp', TMPDIR: '/tmp/pv-1', LANG: 'en_US.UTF-8' },
      signal: new AbortController().signal,
    });
    expect(args).toEqual([
      '-d',
      'Ubuntu',
      '--cd',
      '/mnt/c/work/tree',
      '--exec',
      '/usr/bin/env',
      'TMPDIR=/tmp/pv-1',
      'LANG=en_US.UTF-8',
      '/home/me/.local/bin/claude',
      '--print',
    ]);
  });
});

describe('checkWsl', () => {
  it('is ready when the sandbox tools are installed', async () => {
    const run = vi.fn<Exec>().mockResolvedValue({ stdout: '/usr/bin/bwrap\n/usr/bin/socat\n' });
    await expect(checkWsl('Ubuntu', run)).resolves.toBeNull();
    expect(run).toHaveBeenCalledWith('wsl.exe', [
      '-d',
      'Ubuntu',
      '--exec',
      'sh',
      '-c',
      'command -v bwrap && command -v socat',
    ]);
  });

  it('says how to install WSL when it is missing', async () => {
    const run = vi.fn<Exec>().mockRejectedValue(failure({ code: 'ENOENT' }));
    await expect(checkWsl('Ubuntu', run)).resolves.toMatch(/^WSL is not installed/);
  });

  it('names the missing distro, reading wsl.exe UTF-16 output', async () => {
    const stderr = [...'Error code: Wsl/Service/WSL_E_DISTRO_NOT_FOUND'].join('\0');
    const run = vi.fn<Exec>().mockRejectedValue(failure({ code: 4294967295, stderr }));
    await expect(checkWsl('Ubuntu', run)).resolves.toMatch(
      /^WSL has no distribution named Ubuntu for this Windows user/,
    );
  });

  it('says to install bubblewrap and socat when one is missing', async () => {
    const run = vi.fn<Exec>().mockRejectedValue(failure({ code: 1, stdout: '/usr/bin/bwrap\n' }));
    await expect(checkWsl('Ubuntu', run)).resolves.toMatch(/sudo apt install -y bubblewrap socat/);
  });
});

describe('findWslClaude', () => {
  // Answers by the command after --exec.
  const runner = (answers: Record<string, string | undefined>) =>
    vi.fn<Exec>((_file, args) => {
      const stdout = answers[args[3]!];
      return stdout === undefined
        ? Promise.reject(failure({ code: 1 }))
        : Promise.resolve({ stdout });
    });

  it('uses the one on the login PATH', async () => {
    const run = runner({
      bash: 'welcome\n/home/me/.nvm/bin/claude\n',
      '/home/me/.nvm/bin/claude': '2.1.300 (Claude Code)\n',
    });
    await expect(findWslClaude('Ubuntu', run)).resolves.toEqual({
      executable: '/home/me/.nvm/bin/claude',
    });
  });

  it('skips the Windows install and looks where the installers put it', async () => {
    const run = runner({
      bash: '/mnt/c/Users/me/AppData/Roaming/npm/claude\n',
      sh: '/home/me/.local/bin/claude\n',
      '/home/me/.local/bin/claude': '2.1.300 (Claude Code)\n',
    });
    await expect(findWslClaude('Ubuntu', run)).resolves.toEqual({
      executable: '/home/me/.local/bin/claude',
    });
  });

  it('says when it is missing or too old', async () => {
    const missing = await findWslClaude('Ubuntu', runner({}));
    expect(missing).toEqual({ problem: expect.stringContaining('not installed') as string });
    expect(missing).toEqual({ problem: expect.stringContaining('in Ubuntu') as string });

    const old = await findWslClaude(
      'Ubuntu',
      runner({ bash: '/usr/bin/claude\n', '/usr/bin/claude': '1.0.0 (Claude Code)\n' }),
    );
    expect(old).toEqual({ problem: expect.stringContaining('found 1.0.0') as string });
  });
});
