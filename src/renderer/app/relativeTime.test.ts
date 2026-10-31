import { describe, expect, it } from 'vitest';
import { relativeTime } from './relativeTime.ts';

const now = Date.parse('2026-10-31T12:00:00Z');

describe('relativeTime', () => {
  it('reads recent times as just now', () => {
    expect(relativeTime('2026-10-31T11:59:30Z', now)).toBe('just now');
  });

  it('uses the largest whole unit', () => {
    expect(relativeTime('2026-10-31T10:00:00Z', now)).toBe('2 hours ago');
    expect(relativeTime('2026-10-31T11:15:00Z', now)).toBe('45 minutes ago');
    expect(relativeTime('2026-10-30T12:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('2026-10-24T12:00:00Z', now)).toBe('7 days ago');
  });
});
