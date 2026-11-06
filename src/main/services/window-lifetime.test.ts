import { describe, expect, it, vi } from 'vitest';
import { WindowLifetime } from './window-lifetime.ts';

const lifetime = (busy: boolean, answer = false, keepRunning = true) => {
  const confirmQuit = vi.fn(() => answer);
  return {
    confirmQuit,
    windows: new WindowLifetime({ busy: () => busy, confirmQuit, keepRunning: () => keepRunning }),
  };
};

describe('WindowLifetime', () => {
  it('hides the window on close until the app quits', () => {
    const { windows } = lifetime(false);
    expect(windows.closeAction).toBe('hide');
    expect(windows.requestQuit()).toBe(true);
    expect(windows.closeAction).toBe('close');
  });

  it('quits on close when the app should not keep running', () => {
    const { windows } = lifetime(false, false, false);
    expect(windows.closeAction).toBe('quit');
    expect(windows.requestQuit()).toBe(true);
    expect(windows.closeAction).toBe('close');
  });

  it('quits without asking when no agent runs', () => {
    const { windows, confirmQuit } = lifetime(false);
    expect(windows.requestQuit()).toBe(true);
    expect(confirmQuit).not.toHaveBeenCalled();
  });

  it('keeps running when the user declines to stop an agent', () => {
    const { windows, confirmQuit } = lifetime(true, false);
    expect(windows.requestQuit()).toBe(false);
    expect(confirmQuit).toHaveBeenCalledOnce();
    expect(windows.closeAction).toBe('hide');
  });

  it('quits when the user accepts stopping an agent, and asks only once', () => {
    const { windows, confirmQuit } = lifetime(true, true);
    expect(windows.requestQuit()).toBe(true);
    expect(windows.requestQuit()).toBe(true);
    expect(confirmQuit).toHaveBeenCalledOnce();
  });

  it('skips the question on a forced quit', () => {
    const { windows, confirmQuit } = lifetime(true);
    windows.forceQuit();
    expect(windows.requestQuit()).toBe(true);
    expect(windows.closeAction).toBe('close');
    expect(confirmQuit).not.toHaveBeenCalled();
  });
});
