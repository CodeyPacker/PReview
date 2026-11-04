import { describe, expect, it, vi } from 'vitest';
import { checkWsl, fromWslPath, toWslPath, wslArgs, type Exec } from './wsl.ts';

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
  it('runs the Linux binary in the distro with only the variables Linux needs', () => {
    const args = wslArgs('Ubuntu', {
      command: 'C:\\app\\claude',
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
      '/mnt/c/app/claude',
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
