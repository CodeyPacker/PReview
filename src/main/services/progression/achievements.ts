import type { DatabaseSync } from 'node:sqlite';
import {
  achievementDefinitions,
  type Achievement,
  type AchievementMetric,
  type WeeklyStreak,
} from '../../../shared/contracts/achievements.ts';

const DAY_MS = 86_400_000;

// A number for the Monday-to-Sunday week the time falls in, in the local time zone. It counts
// calendar days, so daylight saving changes don't move it.
function weekNumber(time: Date): number {
  const days = Date.UTC(time.getFullYear(), time.getMonth(), time.getDate()) / DAY_MS;
  // 1970-01-01 was a Thursday, so Monday-based weeks start three days later.
  return Math.floor((days - 4) / 7);
}

export function weeklyStreak(db: DatabaseSync, now = new Date()): WeeklyStreak {
  const weeks = new Set(
    (
      db
        .prepare("SELECT created_at FROM xp_transactions WHERE reason = 'review-completed'")
        .all() as { created_at: string }[]
    ).map((row) => weekNumber(new Date(row.created_at))),
  );
  const thisWeek = weekNumber(now);
  let current = 0;
  for (let week = weeks.has(thisWeek) ? thisWeek : thisWeek - 1; weeks.has(week); week--) {
    current++;
  }
  let longest = 0;
  let run = 0;
  for (const week of [...weeks].sort((a, b) => a - b)) {
    run = weeks.has(week - 1) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest, thisWeek: weeks.has(thisWeek) };
}

const countOf = (db: DatabaseSync, sql: string) =>
  (db.prepare(sql).get() as { total: number }).total;

// The totals achievements count, all from XP awards, so they last after pull requests close.
export function achievementTotals(db: DatabaseSync): Record<AchievementMetric, number> {
  return {
    reviews: countOf(
      db,
      "SELECT COUNT(*) AS total FROM xp_transactions WHERE reason = 'review-completed'",
    ),
    bugs: countOf(
      db,
      "SELECT COUNT(*) AS total FROM xp_transactions WHERE category IN ('bug', 'ui-bug', 'security')",
    ),
    improvements: countOf(
      db,
      "SELECT COUNT(*) AS total FROM xp_transactions WHERE category IN ('improvement', 'test')",
    ),
    streak: weeklyStreak(db).longest,
  };
}

// Records every achievement whose target is now met. An earned achievement is kept. Returns
// the ids earned by this call.
export function unlockAchievements(db: DatabaseSync): string[] {
  const totals = achievementTotals(db);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO earned_achievements (achievement_id) VALUES (?)',
  );
  return achievementDefinitions
    .filter((definition) => totals[definition.metric] >= definition.target)
    .filter((definition) => insert.run(definition.id).changes > 0)
    .map((definition) => definition.id);
}

export function listAchievements(db: DatabaseSync): Achievement[] {
  const totals = achievementTotals(db);
  const earned = new Map(
    (
      db.prepare('SELECT achievement_id, earned_at FROM earned_achievements').all() as {
        achievement_id: string;
        earned_at: string;
      }[]
    ).map((row) => [row.achievement_id, row.earned_at]),
  );
  return achievementDefinitions.map((definition) => ({
    ...definition,
    progress: Math.min(totals[definition.metric], definition.target),
    earnedAt: earned.get(definition.id) ?? null,
  }));
}
