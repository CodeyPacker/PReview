interface ScrollSurface {
  read: () => number;
  write: (top: number) => void;
  max: () => number;
  step: () => number;
  reducedMotion: () => boolean;
}

interface FrameClock {
  now: () => number;
  request: (callback: (time: number) => void) => number;
  cancel: (id: number) => void;
}

// One frame loop owns keyboard scrolling. Taps accumulate against the pending target,
// while a held key advances continuously without relying on the OS key-repeat delay.
export function createFileScroller(
  surface: ScrollSurface,
  clock: FrameClock = {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  },
) {
  let frame: number | undefined;
  let held: -1 | 0 | 1 = 0;
  let lastDirection: -1 | 1 = 1;
  let heldSince = 0;
  let lastTime = 0;
  let target = 0;
  let position = 0;
  const clamp = (value: number) => Math.max(0, Math.min(surface.max(), value));

  function tick(time: number) {
    frame = undefined;
    // Avoid a large jump after a delayed/background frame.
    const elapsed = Math.min(64, Math.max(0, time - lastTime));
    const heldElapsed = Math.min(elapsed, Math.max(0, time - Math.max(lastTime, heldSince + 120)));
    lastTime = time;
    if (held) target = clamp(target + (held * surface.step() * 15 * heldElapsed) / 1000);
    target = clamp(target);
    // Keep subpixel progress internally because Monaco rounds scroll positions to integers.
    position = clamp(position);
    const remaining = target - position;
    let next =
      surface.reducedMotion() || Math.abs(remaining) < 0.5
        ? target
        : position + remaining * (1 - Math.exp(-elapsed / 45));
    if (Math.abs(target - next) < 0.5) next = target;
    position = next;
    surface.write(next);
    const atEdge = held > 0 ? target >= surface.max() : target <= 0;
    if (Math.abs(target - position) >= 0.5 || (held !== 0 && !atEdge)) {
      frame = clock.request(tick);
    }
  }

  function start(direction: -1 | 1) {
    if (held === direction) return;
    const current = surface.read();
    if (frame === undefined || direction !== lastDirection) {
      target = position = current;
    }
    target = clamp(target + direction * surface.step());
    held = lastDirection = direction;
    heldSince = clock.now();
    if (frame === undefined) lastTime = heldSince;
    if (surface.reducedMotion()) {
      position = target;
      surface.write(target);
    }
    if (frame === undefined) frame = clock.request(tick);
  }

  function stop() {
    held = 0;
  }

  function cancel() {
    if (frame !== undefined) clock.cancel(frame);
    frame = undefined;
    held = 0;
    target = position = surface.read();
  }

  return { start, stop, cancel };
}
