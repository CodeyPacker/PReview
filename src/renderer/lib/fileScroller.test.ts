import { describe, expect, it } from 'vitest';
import { createFileScroller } from './fileScroller.ts';

function setup({ max = 3000, reduced = false } = {}) {
  let time = 0;
  let top = 0;
  let id = 0;
  const frames = new Map<number, (time: number) => void>();
  const scroller = createFileScroller(
    {
      read: () => top,
      write: (value) => {
        top = Math.floor(value);
      },
      max: () => max,
      step: () => 60,
      reducedMotion: () => reduced,
    },
    {
      now: () => time,
      request: (callback) => {
        frames.set(++id, callback);
        return id;
      },
      cancel: (frame) => {
        frames.delete(frame);
      },
    },
  );
  function advance(duration: number, interval = 1000 / 60) {
    const end = time + duration;
    while (time < end - 0.00001) {
      time = Math.min(end, time + interval);
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
    }
  }
  return { scroller, advance, top: () => top, pending: () => frames.size };
}

describe('file scrolling', () => {
  it('accumulates rapid taps instead of losing distance to an in-flight animation', () => {
    const test = setup();
    for (let i = 0; i < 3; i++) {
      test.scroller.start(1);
      test.scroller.stop();
    }
    test.advance(600);
    expect(test.top()).toBe(180);
    expect(test.pending()).toBe(0);
  });

  it('keeps held-key speed consistent at different refresh rates', () => {
    const positions = [30, 60, 120].map((fps) => {
      const test = setup();
      test.scroller.start(1);
      test.advance(1000, 1000 / fps);
      test.scroller.stop();
      test.advance(600, 1000 / fps);
      expect(test.pending()).toBe(0);
      return test.top();
    });
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1);
    expect(positions[0]).toBeGreaterThan(750);
  });

  it('reverses without continuing toward the previous target', () => {
    const test = setup();
    test.scroller.start(1);
    test.advance(100);
    const before = test.top();
    test.scroller.start(-1);
    test.advance(20);
    expect(test.top()).toBeLessThan(before);
    test.scroller.stop();
    test.advance(600);
    expect(test.top()).toBe(0);
  });

  it('cancels immediately when another input takes over', () => {
    const test = setup();
    test.scroller.start(1);
    test.advance(400);
    test.scroller.cancel();
    const before = test.top();
    test.advance(1000);
    expect(test.top()).toBe(before);
    expect(test.pending()).toBe(0);
  });

  it('stops scheduling frames at the end of the file', () => {
    const test = setup({ max: 100 });
    test.scroller.start(1);
    test.advance(1000);
    expect(test.top()).toBe(100);
    expect(test.pending()).toBe(0);
  });

  it('keeps taps immediate with reduced motion', () => {
    const test = setup({ reduced: true });
    test.scroller.start(1);
    expect(test.top()).toBe(60);
    test.scroller.stop();
    test.advance(1000);
    expect(test.top()).toBe(60);
    expect(test.pending()).toBe(0);
  });
});
