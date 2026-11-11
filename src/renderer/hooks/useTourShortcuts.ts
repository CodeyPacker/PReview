import { useEffect, useEffectEvent } from 'react';
import { isTypingOrInOverlay } from './useReviewShortcuts.ts';

export function useTourShortcuts(
  active: boolean,
  busy: boolean,
  actions: { deeper: () => void; technical: () => void; ask: () => void },
) {
  const perform = useEffectEvent((key: string) => {
    if (busy) return;
    if (key === 'd') actions.deeper();
    if (key === 't') actions.technical();
    if (key === 'a') actions.ask();
  });

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        isTypingOrInOverlay(event.target)
      )
        return;
      const key = event.key.toLowerCase();
      if (!['d', 't', 'a'].includes(key)) return;
      event.preventDefault();
      event.stopPropagation();
      perform(key);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active]);
}
