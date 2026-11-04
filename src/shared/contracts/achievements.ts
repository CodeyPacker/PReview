import { z } from 'zod';

// What an achievement counts. reviews: finished reviews. bugs: bugs, UI bugs and security
// problems fixed and resolved. improvements: improvements and tests fixed and resolved.
// streak: the longest run of weeks with a finished review.
export const achievementMetricSchema = z.enum(['reviews', 'bugs', 'improvements', 'streak']);
export type AchievementMetric = z.infer<typeof achievementMetricSchema>;

// Predefined milestones from SCOPE 12.9. Add one here to add it to the app.
export const achievementDefinitions = [
  {
    id: 'first-review',
    name: 'First Review',
    description: 'Finish your first review',
    metric: 'reviews',
    target: 1,
  },
  {
    id: 'first-bug',
    name: 'First Bug Caught',
    description: 'Get your first bug fixed',
    metric: 'bugs',
    target: 1,
  },
  {
    id: 'reviews-10',
    name: 'Ten Reviews',
    description: 'Finish 10 reviews',
    metric: 'reviews',
    target: 10,
  },
  {
    id: 'bugs-25',
    name: 'Bug Hunter',
    description: 'Get 25 bugs fixed',
    metric: 'bugs',
    target: 25,
  },
  {
    id: 'improvements-50',
    name: 'Idea Generator',
    description: 'Get 50 improvements made',
    metric: 'improvements',
    target: 50,
  },
  {
    id: 'streak-10',
    name: 'Ten-Week Streak',
    description: 'Finish a review every week for 10 weeks',
    metric: 'streak',
    target: 10,
  },
  {
    id: 'reviews-100',
    name: 'Century',
    description: 'Finish 100 reviews',
    metric: 'reviews',
    target: 100,
  },
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  metric: AchievementMetric;
  target: number;
}[];

export const achievementSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  metric: achievementMetricSchema,
  target: z.number().int(),
  // Capped at target.
  progress: z.number().int(),
  // Null until earned.
  earnedAt: z.string().nullable(),
});
export type Achievement = z.infer<typeof achievementSchema>;

// Weeks run Monday to Sunday in the computer's time zone. current counts back from this week,
// or from last week while this week has no finished review yet.
export const weeklyStreakSchema = z.object({
  current: z.number().int(),
  longest: z.number().int(),
  thisWeek: z.boolean(),
});
export type WeeklyStreak = z.infer<typeof weeklyStreakSchema>;
