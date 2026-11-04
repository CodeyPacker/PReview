import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { getProgressStats } from './stats.ts';

let db: ReturnType<typeof openDatabase>;
let key = 0;

function addAward(
  at: Date,
  amount: number,
  reason = 'review-completed',
  category: string | null = null,
) {
  db.prepare(
    `INSERT INTO xp_transactions
       (reward_key, reason, base_xp, multiplier, amount, active_ms, pull_request_id, repository,
        number, category, character_id, created_at)
     VALUES (?, ?, ?, 1, ?, 0, 1, 'octo/app', 1, ?, 'shadow', ?)`,
  ).run(`k${key++}`, reason, amount, amount, category, at.toISOString());
}

// Local dates. 2026-11-04 is a Wednesday.
const day = (date: number, hour = 12) => new Date(2026, 10, date, hour);

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('progress stats', () => {
  it('counts the last 7 days against the 7 before', () => {
    addAward(day(-5), 20); // Oct 26, in the 7 days before
    addAward(day(1, 0), 20); // Nov 1 at midnight, last 7 days
    addAward(day(4, 23), 20, 'finding-resolved', 'bug');
    addAward(day(4, 23), 20);
    const stats = getProgressStats(db, day(4, 23));
    expect(stats.reviews).toEqual({ total: 3, days: [0, 0, 0, 1, 0, 0, 1], delta: 100 });
    expect(stats.bugs).toEqual({ total: 1, days: [0, 0, 0, 0, 0, 0, 1], delta: null });
    expect(stats.xp.total).toBe(80);
  });

  it('sums this Monday-to-Sunday week', () => {
    addAward(day(1), 20); // Sunday, last week
    addAward(day(2, 0), 20); // Monday
    addAward(day(4), 50, 'finding-resolved', 'bug');
    addAward(day(8, 23), 25, 'comment-resolved', 'test'); // Sunday
    expect(getProgressStats(db, day(4)).thisWeek).toEqual({
      reviews: 1,
      findings: 2,
      xp: 95,
      xpByDay: [20, 0, 50, 0, 0, 0, 25],
    });
  });
});
