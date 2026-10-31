import { useEffect, useEffectEvent } from 'react';
import type { ReviewLeader } from '../../shared/contracts/settings.ts';
import { matchesReviewLeader, reviewShortcuts, type ReviewAction } from '../lib/reviewShortcuts.ts';

function isTypingOrInOverlay(target: EventTarget | null): boolean {
  if (target instanceof Element) {
    const editable = target.closest(
      'input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])',
    );
    // Monaco's read-only input is focusable. It must not require a click before J/K works,
    // and focusing it must not turn the shortcuts off either. Its find input still blocks them.
    const readOnlyInput =
      editable?.closest('[data-review-diff]') &&
      editable.matches('.native-edit-context, .inputarea');
    if (editable && !readOnlyInput) return true;
  }
  return [
    ...document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
    ),
  ].some(
    (element) =>
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
  );
}

export function useReviewShortcuts(
  leader: ReviewLeader,
  actions: Record<ReviewAction, () => void>,
  scroll: {
    start: (direction: -1 | 1) => void;
    stop: () => void;
    cancel: () => void;
  },
) {
  const performAction = useEffectEvent((action: ReviewAction) => actions[action]());
  const startScroll = useEffectEvent((direction: -1 | 1) => scroll.start(direction));
  const stopScroll = useEffectEvent(() => scroll.stop());
  const cancelScroll = useEffectEvent(() => scroll.cancel());

  useEffect(() => {
    let scrollingKey: string | undefined;
    const cancel = () => {
      scrollingKey = undefined;
      cancelScroll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isTypingOrInOverlay(event.target)) {
        cancel();
        return;
      }
      const key = event.key.toLowerCase();
      if (
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (key === 'j' || key === 'k')
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (scrollingKey !== key) {
          scrollingKey = key;
          startScroll(key === 'j' ? 1 : -1);
        }
        return;
      }
      if (scrollingKey) cancel();
      if (!matchesReviewLeader(event, leader)) return;
      const chordKey = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : key;
      const action = (Object.keys(reviewShortcuts) as ReviewAction[]).find(
        (name) => reviewShortcuts[name].key === chordKey,
      );
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      // A held approval key must not approve a succession of files.
      if (!event.repeat) performAction(action);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === scrollingKey) {
        scrollingKey = undefined;
        stopScroll();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (isTypingOrInOverlay(event.target)) cancel();
    };
    const onVisibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('pointerdown', cancel, true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancel();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('pointerdown', cancel, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [leader]);
}
