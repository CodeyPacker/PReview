import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { listAchievements, unlockAchievements, weeklyStreak } from './achievements.ts';

let db: ReturnType<typeof openDatabase>;
let key = 0;

// An award made at a local time, so weeks follow the test machine's time zone.
function addAward(at: Date, reason = 'review-completed', category: string | null = null) {
  db.prepare(
    `INSERT INTO xp_transactions
       (reward_key, reason, base_xp, multiplier, amount, active_ms, pull_request_id, repository,
        number, category, character_id, created_at)
     VALUES (?, ?, 20, 1, 20, 0, 1, 'octo/app', 1, ?, 'shadow', ?)`,
  ).run(`k${key++}`, reason, category, at.toISOString());
}

// Local dates. 2026-11-02 is a Monday.
const day = (date: number, hour = 12) => new Date(2026, 10, date, hour);

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('weekly streak', () => {
  it('counts weeks in a row with a finished review', () => {
    addAward(day(-12)); // Oct 19, three weeks before
    addAward(day(-5)); // Oct 26
    addAward(day(-4)); // same week
    addAward(day(2, 0)); // Monday at midnight
    expect(weeklyStreak(db, day(8, 23))).toEqual({ current: 3, longest: 3, thisWeek: true });
  });

  it('keeps last week alive until this week ends', () => {
    addAward(day(-5));
    addAward(day(1, 23)); // Sunday night, still last week
    expect(weeklyStreak(db, day(4))).toEqual({ current: 1, longest: 1, thisWeek: false });
    expect(weeklyStreak(db, day(10))).toEqual({ current: 0, longest: 1, thisWeek: false });
  });

  it('remembers the longest run after a gap', () => {
    addAward(day(-26));
    addAward(day(-19));
    addAward(day(-12));
    addAward(day(3));
    expect(weeklyStreak(db, day(3))).toEqual({ current: 1, longest: 3, thisWeek: true });
  });

  it('ignores other awards', () => {
    addAward(day(3), 'finding-resolved', 'bug');
    expect(weeklyStreak(db, day(3)).current).toBe(0);
  });
});

describe('achievements', () => {
  it('unlocks once its target is met and keeps it', () => {
    expect(unlockAchievements(db)).toEqual([]);
    addAward(day(3));
    addAward(day(3), 'finding-resolved', 'security');
    expect(unlockAchievements(db)).toEqual(['first-review', 'first-bug']);
    expect(unlockAchievements(db)).toEqual([]);
    db.prepare('DELETE FROM xp_transactions').run();
    const achievements = listAchievements(db);
    expect(achievements.find((item) => item.id === 'first-review')?.earnedAt).not.toBeNull();
    expect(achievements.find((item) => item.id === 'reviews-10')).toMatchObject({
      progress: 0,
      earnedAt: null,
    });
  });

  it('caps progress at the target', () => {
    for (let i = 0; i < 12; i++) addAward(day(3), 'finding-resolved', 'improvement');
    expect(listAchievements(db).find((item) => item.id === 'improvements-50')?.progress).toBe(12);
    for (let i = 0; i < 12; i++) addAward(day(3));
    expect(listAchievements(db).find((item) => item.id === 'reviews-10')?.progress).toBe(10);
  });
});
