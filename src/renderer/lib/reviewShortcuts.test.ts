import { describe, expect, it } from 'vitest';
import { matchesReviewLeader, reviewShortcutLabel } from './reviewShortcuts.ts';

describe('review shortcut leader', () => {
  const control = { ctrlKey: true, altKey: false, metaKey: false, shiftKey: false };
  it('matches the configured modifier exactly', () => {
    expect(matchesReviewLeader(control, 'Control')).toBe(true);
    expect(matchesReviewLeader(control, 'Control+Shift')).toBe(false);
    expect(matchesReviewLeader({ ...control, shiftKey: true }, 'Control')).toBe(false);
    expect(matchesReviewLeader({ ...control, shiftKey: true }, 'Control+Shift')).toBe(true);
    expect(matchesReviewLeader({ ...control, metaKey: true }, 'Control')).toBe(false);
  });
  it('labels platform-specific modifiers', () => {
    expect(reviewShortcutLabel('Control', 'a', true)).toBe('Ctrl+A');
    expect(reviewShortcutLabel('Meta+Shift', 'z', true)).toBe('Cmd+Shift+Z');
    expect(reviewShortcutLabel('Meta', 'b', false)).toBe('Win+B');
  });
});
