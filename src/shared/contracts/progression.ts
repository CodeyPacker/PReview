import { z } from 'zod';
import { weeklyStreakSchema } from './achievements.ts';
import { findingCategorySchema, type FindingCategory } from './review-findings.ts';

export const characterIdSchema = z.enum(['shadow', 'ember', 'frost', 'bolt']);
export type CharacterId = z.infer<typeof characterIdSchema>;

// The MVP roster. Shadow is unlocked from the start, and the rest unlock at an account level.
// Names other than Shadow are placeholders until the art is made.
export const characters = [
  { id: 'shadow', name: 'Shadow', title: 'The ninja', unlockLevel: 1 },
  { id: 'ember', name: 'Ember', title: 'Placeholder', unlockLevel: 3 },
  { id: 'frost', name: 'Frost', title: 'Placeholder', unlockLevel: 6 },
  { id: 'bolt', name: 'Bolt', title: 'Placeholder', unlockLevel: 10 },
] as const satisfies readonly {
  id: CharacterId;
  name: string;
  title: string;
  unlockLevel: number;
}[];

export const defaultCharacter: CharacterId = 'shadow';

export const outfitIdSchema = z.enum(['default', 'midnight', 'crimson', 'sage']);
export type OutfitId = z.infer<typeof outfitIdSchema>;

// Complete outfits every character has, each unlocked at a character level (SCOPE 13.3).
// They have no art yet.
export const outfits = [
  { id: 'default', name: 'Default', unlockLevel: 1 },
  { id: 'midnight', name: 'Midnight', unlockLevel: 3 },
  { id: 'crimson', name: 'Crimson', unlockLevel: 5 },
  { id: 'sage', name: 'Sage', unlockLevel: 8 },
] as const satisfies readonly { id: OutfitId; name: string; unlockLevel: number }[];

export const weaponIdSchema = z.enum(['dagger', 'void-crescent', 'sunfang', 'stormfork']);
export type WeaponId = z.infer<typeof weaponIdSchema>;

// Weapons every character can hold, chosen apart from the outfit (SCOPE 13.3). Each is unlocked
// at a character level.
export const weapons = [
  { id: 'dagger', name: 'Dagger', unlockLevel: 1 },
  { id: 'void-crescent', name: 'Void Crescent', unlockLevel: 2 },
  { id: 'sunfang', name: 'Sunfang', unlockLevel: 4 },
  { id: 'stormfork', name: 'Stormfork', unlockLevel: 6 },
] as const satisfies readonly { id: WeaponId; name: string; unlockLevel: number }[];

// Fixed XP per level for both the account and each character (SCOPE 13.2).
export const ACCOUNT_XP_PER_LEVEL = 1000;
export const CHARACTER_XP_PER_LEVEL = 500;

export const xpReasonSchema = z.enum(['review-completed', 'finding-resolved', 'comment-resolved']);
export type XpReason = z.infer<typeof xpReasonSchema>;

// Starting balance from SCOPE 12.3. A test finding earns what an improvement does. A line
// comment with a category earns what a finding of that category does.
export const REVIEW_COMPLETED_XP = 20;
export const findingXp = {
  bug: 50,
  'ui-bug': 60,
  security: 100,
  improvement: 25,
  test: 25,
} satisfies Record<FindingCategory, number>;

// Active review time brackets from SCOPE 12.5, in minutes, highest first.
const multiplierBrackets = [
  { minutes: 60, multiplier: 1.5 },
  { minutes: 30, multiplier: 1.4 },
  { minutes: 15, multiplier: 1.25 },
  { minutes: 5, multiplier: 1.1 },
] as const;

export function reviewTimeMultiplier(activeMs: number): number {
  const minutes = activeMs / 60_000;
  return multiplierBrackets.find((bracket) => minutes >= bracket.minutes)?.multiplier ?? 1;
}

// Level 1 starts at 0 XP. levelXp is the XP earned inside the current level.
export function levelOf(xp: number, perLevel: number) {
  return {
    xp,
    level: Math.floor(xp / perLevel) + 1,
    levelXp: xp % perLevel,
    nextLevelXp: perLevel,
  };
}

const levelSchema = z.object({
  xp: z.number().int(),
  level: z.number().int(),
  levelXp: z.number().int(),
  nextLevelXp: z.number().int(),
});

export const characterProgressSchema = levelSchema.extend({
  id: characterIdSchema,
  name: z.string(),
  title: z.string(),
  unlockLevel: z.number().int(),
  unlocked: z.boolean(),
  // The outfit the character wears.
  outfit: outfitIdSchema,
  // The weapon the character holds.
  weapon: weaponIdSchema,
});
export type CharacterProgress = z.infer<typeof characterProgressSchema>;

export const progressionSchema = z.object({
  account: levelSchema,
  streak: weeklyStreakSchema,
  activeCharacter: characterIdSchema,
  characters: z.array(characterProgressSchema),
});
export type Progression = z.infer<typeof progressionSchema>;

// One XP award. It is kept when its pull request closes, so it names the pull request by
// repository and number.
export const xpTransactionSchema = z.object({
  id: z.number().int(),
  reason: xpReasonSchema,
  baseXp: z.number().int(),
  multiplier: z.number(),
  amount: z.number().int(),
  // The active review time the multiplier came from.
  activeMs: z.number().int(),
  pullRequestId: z.number().int(),
  repository: z.string(),
  number: z.number().int(),
  findingId: z.number().int().nullable(),
  commentId: z.number().int().nullable(),
  // The kind of finding or comment. Null for a finished review.
  category: findingCategorySchema.nullable(),
  characterId: characterIdSchema,
  createdAt: z.string(),
});
export type XpTransaction = z.infer<typeof xpTransactionSchema>;

// One Dashboard number: its total, the last 7 days oldest first, and the change of the last
// 7 days against the 7 before as a percent. delta is null when the 7 before had none.
export const progressStatSchema = z.object({
  total: z.number().int(),
  days: z.array(z.number().int()),
  delta: z.number().int().nullable(),
});
export type ProgressStat = z.infer<typeof progressStatSchema>;

export const progressStatsSchema = z.object({
  reviews: progressStatSchema,
  bugs: progressStatSchema,
  improvements: progressStatSchema,
  xp: progressStatSchema,
  // This calendar week, Monday to Sunday. xpByDay has seven values.
  thisWeek: z.object({
    reviews: z.number().int(),
    findings: z.number().int(),
    xp: z.number().int(),
    xpByDay: z.array(z.number().int()),
  }),
});
export type ProgressStats = z.infer<typeof progressStatsSchema>;
