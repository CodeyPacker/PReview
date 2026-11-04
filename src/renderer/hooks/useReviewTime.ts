import { useEffect } from 'react';

// Time counts only while the window is focused and the reviewer used the keyboard, mouse or
// wheel within the last minute, so idle and background time is left out (SCOPE 12.5).
const IDLE_AFTER_MS = 60_000;
const TICK_MS = 5_000;
const REPORT_EVERY_MS = 30_000;

// Counts active time on a review and reports it to the main process every half minute, and
// when the review closes.
export function useReviewTime(pullRequestId: number) {
  useEffect(() => {
    let lastInput = Date.now();
    let lastTick = Date.now();
    let unreported = 0;
    let sinceReport = 0;

    const onInput = () => {
      lastInput = Date.now();
    };
    const report = () => {
      if (unreported === 0) return;
      void window.preview.progression.addReviewTime(pullRequestId, Math.round(unreported));
      unreported = 0;
      sinceReport = 0;
    };
    const tick = () => {
      const now = Date.now();
      const elapsed = now - lastTick;
      lastTick = now;
      const active =
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        now - lastInput < IDLE_AFTER_MS;
      // A tick that came late, such as after the computer slept, counts as one tick.
      if (active) unreported += Math.min(elapsed, TICK_MS);
      sinceReport += elapsed;
      if (sinceReport >= REPORT_EVERY_MS) report();
    };

    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const;
    for (const event of events) window.addEventListener(event, onInput, { passive: true });
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(timer);
      for (const event of events) window.removeEventListener(event, onInput);
      tick();
      report();
    };
  }, [pullRequestId]);
}
