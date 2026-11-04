import type { DatabaseSync } from 'node:sqlite';
import type { ProgressStat, ProgressStats } from '../../../shared/contracts/progression.ts';

const DAY_MS = 86_400_000;

// Calendar days since 1970 in the local time zone, so daylight saving changes don't move them.
const dayNumber = (time: Date) =>
  Date.UTC(time.getFullYear(), time.getMonth(), time.getDate()) / DAY_MS;

interface Award {
  day: number;
  reason: string;
  category: string | null;
  amount: number;
}

const isReview = (award: Award) => award.reason === 'review-completed';
const isBug = (award: Award) => ['bug', 'ui-bug', 'security'].includes(award.category ?? '');
const isImprovement = (award: Award) => ['improvement', 'test'].includes(award.category ?? '');

function stat(awards: Award[], today: number, value: (award: Award) => number): ProgressStat {
  const sumDays = (from: number, to: number) =>
    awards
      .filter((award) => award.day >= from && award.day <= to)
      .reduce((total, award) => total + value(award), 0);
  const last = sumDays(today - 6, today);
  const before = sumDays(today - 13, today - 7);
  return {
    total: awards.reduce((total, award) => total + value(award), 0),
    days: Array.from({ length: 7 }, (_, index) => sumDays(today - 6 + index, today - 6 + index)),
    delta: before === 0 ? null : Math.round(((last - before) / before) * 100),
  };
}

// Dashboard numbers, all from XP awards, so they last after pull requests close.
export function getProgressStats(db: DatabaseSync, now = new Date()): ProgressStats {
  const awards = (
    db.prepare('SELECT created_at, reason, category, amount FROM xp_transactions').all() as {
      created_at: string;
      reason: string;
      category: string | null;
      amount: number;
    }[]
  ).map((row) => ({ ...row, day: dayNumber(new Date(row.created_at)) }));
  const today = dayNumber(now);
  const count = (test: (award: Award) => boolean) => (award: Award) => (test(award) ? 1 : 0);
  // Monday is 0. Day 0 of 1970 was a Thursday.
  const monday = today - ((today + 3) % 7);
  const week = awards.filter((award) => award.day >= monday && award.day <= monday + 6);
  return {
    reviews: stat(awards, today, count(isReview)),
    bugs: stat(awards, today, count(isBug)),
    improvements: stat(awards, today, count(isImprovement)),
    xp: stat(awards, today, (award) => award.amount),
    thisWeek: {
      reviews: week.filter(isReview).length,
      findings: week.filter((award) => !isReview(award)).length,
      xp: week.reduce((total, award) => total + award.amount, 0),
      xpByDay: Array.from({ length: 7 }, (_, index) =>
        week
          .filter((award) => award.day === monday + index)
          .reduce((total, award) => total + award.amount, 0),
      ),
    },
  };
}
