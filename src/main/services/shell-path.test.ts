import { describe, expect, it, vi } from 'vitest';
import { shellPath, type ShellPathDeps } from './shell-path.ts';

const deps = (run: ShellPathDeps['run']): ShellPathDeps => ({
  run,
  shell: '/bin/zsh',
  home: '/Users/me',
  current: '/usr/bin:/bin',
});

describe('shellPath', () => {
  it('puts the shell’s folders first and adds the installers’ folders once', async () => {
    const run = vi.fn<ShellPathDeps['run']>().mockResolvedValue({
      stdout: 'Welcome back\n\n__PREVIEW_PATH__/Users/me/.nvm/bin:/opt/homebrew/bin:/usr/bin\n',
    });
    await expect(shellPath(deps(run))).resolves.toBe(
      '/Users/me/.nvm/bin:/opt/homebrew/bin:/usr/bin:/bin:/Users/me/.local/bin:/usr/local/bin',
    );
  });

  it('still adds the installers’ folders when the shell fails', async () => {
    const run = vi.fn<ShellPathDeps['run']>().mockRejectedValue(new Error('timed out'));
    await expect(shellPath(deps(run))).resolves.toBe(
      '/usr/bin:/bin:/Users/me/.local/bin:/opt/homebrew/bin:/usr/local/bin',
    );
  });

  it('ignores output without the marked line', async () => {
    const run = vi.fn<ShellPathDeps['run']>().mockResolvedValue({ stdout: '/evil/bin\n' });
    await expect(shellPath(deps(run))).resolves.not.toContain('/evil/bin');
  });
});
