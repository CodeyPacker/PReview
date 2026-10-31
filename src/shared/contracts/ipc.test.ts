import { describe, expect, it } from 'vitest';
import { ipcContract } from './ipc.ts';

describe('ipcContract', () => {
  const update = ipcContract['settings.update'].input;

  it('accepts a valid settings patch', () => {
    expect(update.safeParse({ theme: 'dark' }).success).toBe(true);
    expect(update.safeParse({}).success).toBe(true);
    expect(update.safeParse({ reviewLeader: 'Control' }).success).toBe(true);
  });

  it('rejects unknown values and unknown keys', () => {
    expect(update.safeParse({ theme: 'neon' }).success).toBe(false);
    expect(update.safeParse({ reviewLeader: 'Space' }).success).toBe(false);
    expect(update.safeParse({ theme: 'dark', admin: true }).success).toBe(false);
  });

  it('rejects input on channels that take none', () => {
    expect(ipcContract['settings.getAll'].input.safeParse(undefined).success).toBe(true);
    expect(ipcContract['settings.getAll'].input.safeParse({ any: 1 }).success).toBe(false);
  });
});
