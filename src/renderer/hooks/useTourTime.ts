import { useEffect, useEffectEvent } from 'react';

// Count only visible, focused tour time within a minute of input. Absolute totals make
// retried or late reports harmless. Flushing on close also covers leaving the PR route.
export function useTourTime(
  tourId: number | undefined,
  initialMs: number,
  onError: (error: unknown) => void,
) {
  const reportError = useEffectEvent(onError);
  useEffect(() => {
    if (tourId === undefined) return;
    let total = initialMs;
    let saved = initialMs;
    let lastInput = Date.now();
    let lastTick = Date.now();
    let sinceReport = 0;
    const input = () => {
      lastInput = Date.now();
    };
    const report = () => {
      if (total === saved) return;
      const value = Math.round(total);
      void window.preview.tours
        .progress({ tourId, activeMs: value })
        .then(() => {
          saved = Math.max(saved, value);
        })
        .catch(reportError);
    };
    const tick = () => {
      const now = Date.now();
      const elapsed = now - lastTick;
      lastTick = now;
      if (
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        now - lastInput < 60_000
      ) {
        total += Math.max(0, Math.min(elapsed, 5000));
      }
      sinceReport += elapsed;
      if (sinceReport >= 30_000) {
        sinceReport = 0;
        report();
      }
    };
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const;
    for (const event of events) window.addEventListener(event, input, { passive: true });
    const timer = window.setInterval(tick, 5000);
    const onPageHide = () => {
      tick();
      report();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(timer);
      for (const event of events) window.removeEventListener(event, input);
      window.removeEventListener('pagehide', onPageHide);
      tick();
      report();
    };
  }, [tourId, initialMs]);
}
