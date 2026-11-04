import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectivityWatch } from './connectivity.ts';

let online: boolean;
const onReconnect = vi.fn();
let watch: ConnectivityWatch;

beforeEach(() => {
  vi.useFakeTimers();
  online = true;
  onReconnect.mockReset();
  watch = new ConnectivityWatch({
    isOnline: () => online,
    onReconnect,
    pollMs: 1000,
    resumeDelayMs: 500,
  });
});

afterEach(() => {
  watch.stop();
  vi.useRealTimers();
});

describe('ConnectivityWatch', () => {
  it('reports the network coming back, once', () => {
    watch.start();
    vi.advanceTimersByTime(1000);
    expect(onReconnect).not.toHaveBeenCalled();

    online = false;
    vi.advanceTimersByTime(2000);
    online = true;
    vi.advanceTimersByTime(3000);

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('reports the network that was down at start once it comes back', () => {
    online = false;
    watch.start();
    online = true;
    vi.advanceTimersByTime(1000);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('reports a wake after a short wait, and not while offline', () => {
    watch.start();
    watch.resumed();
    vi.advanceTimersByTime(499);
    expect(onReconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReconnect).toHaveBeenCalledTimes(1);

    online = false;
    watch.resumed();
    vi.advanceTimersByTime(500);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
