import { describe, expect, it } from 'vitest';
import { defaultSettings, reviewKeysSchema } from '../../shared/contracts/settings.ts';
import { changeReviewKey, matchesReviewLeader, reviewShortcutLabel } from './reviewShortcuts.ts';

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

describe('changeReviewKey', () => {
  const keys = defaultSettings.reviewKeys;
  it('gives the action a free letter', () => {
    expect(changeReviewKey(keys, 'zen', 'KeyY').keys).toEqual({ ...keys, zen: 'y' });
  });
  it('leaves the keys alone when the action already has the letter', () => {
    expect(changeReviewKey(keys, 'zen', 'KeyZ').keys).toBe(keys);
  });
  it('refuses anything but a letter', () => {
    expect(changeReviewKey(keys, 'zen', 'Digit1').error).toBe('Use a letter from A to Z.');
  });
  it('refuses a letter another action has', () => {
    expect(changeReviewKey(keys, 'zen', 'KeyN').error).toBe('N is already used for Next file.');
  });
  it('refuses a reserved letter', () => {
    expect(changeReviewKey(keys, 'zen', 'KeyC').error).toContain('C is kept');
  });
});

describe('reviewKeysSchema', () => {
  const keys = defaultSettings.reviewKeys;
  it('accepts the defaults', () => {
    expect(reviewKeysSchema.safeParse(keys).success).toBe(true);
  });
  it('refuses a shared, reserved or non-letter key', () => {
    expect(reviewKeysSchema.safeParse({ ...keys, zen: 'n' }).success).toBe(false);
    expect(reviewKeysSchema.safeParse({ ...keys, zen: 'c' }).success).toBe(false);
    expect(reviewKeysSchema.safeParse({ ...keys, zen: '1' }).success).toBe(false);
  });
});
