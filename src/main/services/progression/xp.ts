import type { DatabaseSync } from 'node:sqlite';
import type { AgentReport } from '../../../shared/contracts/agent-tasks.ts';
import {
  ACCOUNT_XP_PER_LEVEL,
  CHARACTER_XP_PER_LEVEL,
  characterIdSchema,
  characters,
  defaultCharacter,
  findingXp,
  levelOf,
  outfitsFor,
  weaponsFor,
  REVIEW_COMPLETED_XP,
  reviewTimeMultiplier,
  type CharacterId,
  type OutfitId,
  type WeaponId,
  type Progression,
  type XpReason,
  type XpTransaction,
} from '../../../shared/contracts/progression.ts';
import type { FindingCategory } from '../../../shared/contracts/review-findings.ts';
import { unlockAchievements, weeklyStreak } from './achievements.ts';

// The most active time one report can add. The renderer reports every half minute, so a
// bigger number is a bug or a page that isn't the app's.
export const MAX_REVIEW_TIME_REPORT_MS = 60_000;

export function getActiveCharacter(db: DatabaseSync): CharacterId {
  const row = db.prepare('SELECT active_character FROM account_progress WHERE id = 1').get() as
    { active_character: string } | undefined;
  const parsed = characterIdSchema.safeParse(row?.active_character);
  return parsed.success ? parsed.data : defaultCharacter;
}

const totalXp = (db: DatabaseSync) =>
  (db.prepare('SELECT SUM(amount) AS total FROM xp_transactions').get() as { total: number | null })
    .total ?? 0;

export function getProgression(db: DatabaseSync): Progression {
  const account = levelOf(totalXp(db), ACCOUNT_XP_PER_LEVEL);
  const byCharacter = new Map(
    (
      db
        .prepare(
          'SELECT character_id, SUM(amount) AS total FROM xp_transactions GROUP BY character_id',
        )
        .all() as { character_id: string; total: number }[]
    ).map((row) => [row.character_id, row.total]),
  );
  const worn = new Map(
    (
      db.prepare('SELECT character_id, outfit_id FROM character_outfits').all() as {
        character_id: string;
        outfit_id: string;
      }[]
    ).map((row) => [row.character_id, row.outfit_id]),
  );
  const held = new Map(
    (
      db.prepare('SELECT character_id, weapon_id FROM character_weapons').all() as {
        character_id: string;
        weapon_id: string;
      }[]
    ).map((row) => [row.character_id, row.weapon_id]),
  );
  return {
    account,
    streak: weeklyStreak(db),
    activeCharacter: getActiveCharacter(db),
    characters: characters.map((character) => ({
      ...character,
      ...levelOf(byCharacter.get(character.id) ?? 0, CHARACTER_XP_PER_LEVEL),
      unlocked: account.level >= character.unlockLevel,
      outfit:
        outfitsFor(character.id).find((outfit) => outfit.id === worn.get(character.id))?.id ??
        'default',
      weapon:
        weaponsFor(character.id).find((weapon) => weapon.id === held.get(character.id))?.id ??
        weaponsFor(character.id)[0]!.id,
    })),
  };
}

// Only an unlocked character can be picked. Reviews already open keep the character they
// started with.
export function setActiveCharacter(db: DatabaseSync, characterId: CharacterId): Progression {
  const progression = getProgression(db);
  const character = progression.characters.find((candidate) => candidate.id === characterId);
  if (!character?.unlocked) throw new Error('That character is still locked.');
  db.prepare('UPDATE account_progress SET active_character = ? WHERE id = 1').run(characterId);
  return { ...progression, activeCharacter: characterId };
}

// Dresses a character in an outfit its level has unlocked.
export function setOutfit(
  db: DatabaseSync,
  characterId: CharacterId,
  outfitId: OutfitId,
): Progression {
  const character = getProgression(db).characters.find((candidate) => candidate.id === characterId);
  const outfit = outfitsFor(characterId).find((candidate) => candidate.id === outfitId);
  if (!character?.unlocked || !outfit || character.level < outfit.unlockLevel) {
    throw new Error('That outfit is still locked.');
  }
  db.prepare(
    `INSERT INTO character_outfits (character_id, outfit_id) VALUES (?, ?)
     ON CONFLICT (character_id) DO UPDATE SET outfit_id = excluded.outfit_id`,
  ).run(characterId, outfitId);
  return getProgression(db);
}

// Gives a character a weapon its level has unlocked.
export function setWeapon(
  db: DatabaseSync,
  characterId: CharacterId,
  weaponId: WeaponId,
): Progression {
  const character = getProgression(db).characters.find((candidate) => candidate.id === characterId);
  const weapon = weaponsFor(characterId).find((candidate) => candidate.id === weaponId);
  if (!character?.unlocked || !weapon || character.level < weapon.unlockLevel) {
    throw new Error('That weapon is still locked.');
  }
  db.prepare(
    `INSERT INTO character_weapons (character_id, weapon_id) VALUES (?, ?)
     ON CONFLICT (character_id) DO UPDATE SET weapon_id = excluded.weapon_id`,
  ).run(characterId, weaponId);
  return getProgression(db);
}

// Picks the character the review earns XP for. Opening the review again keeps the first pick.
export function startReviewProgress(db: DatabaseSync, pullRequestId: number): void {
  db.prepare(
    'INSERT OR IGNORE INTO review_progress (pull_request_id, character_id) VALUES (?, ?)',
  ).run(pullRequestId, getActiveCharacter(db));
}

// Adds focused, recently used time on the review screen. Each report is capped.
export function addReviewTime(db: DatabaseSync, pullRequestId: number, ms: number): void {
  const added = Math.min(Math.max(Math.round(ms), 0), MAX_REVIEW_TIME_REPORT_MS);
  if (added === 0) return;
  startReviewProgress(db, pullRequestId);
  db.prepare('UPDATE review_progress SET active_ms = active_ms + ? WHERE pull_request_id = ?').run(
    added,
    pullRequestId,
  );
}

interface Reward {
  // Names what earned the award, from the pull request's owner/name and number.
  key: (repository: string, number: number) => string;
  reason: XpReason;
  baseXp: number;
  pullRequestId: number;
  findingId?: number;
  commentId?: number;
  category?: FindingCategory;
}

// Records one award with the multiplier the review's active time gives now, so later review
// time doesn't change it. An award whose key is already recorded adds nothing. Returns
// whether it was added.
function award(db: DatabaseSync, reward: Reward): boolean {
  const pullRequest = db
    .prepare(
      `SELECT p.number, r.github_owner, r.github_name, rp.character_id, rp.active_ms
       FROM pull_requests p
       JOIN repositories r ON r.id = p.repository_id
       LEFT JOIN review_progress rp ON rp.pull_request_id = p.id
       WHERE p.id = ?`,
    )
    .get(reward.pullRequestId) as
    | {
        number: number;
        github_owner: string | null;
        github_name: string | null;
        character_id: string | null;
        active_ms: number | null;
      }
    | undefined;
  if (!pullRequest?.github_owner || !pullRequest.github_name) return false;
  const repository = `${pullRequest.github_owner}/${pullRequest.github_name}`;
  const character = characterIdSchema.safeParse(pullRequest.character_id);
  const activeMs = pullRequest.active_ms ?? 0;
  const multiplier = reviewTimeMultiplier(activeMs);
  const { changes } = db
    .prepare(
      `INSERT OR IGNORE INTO xp_transactions
         (reward_key, reason, base_xp, multiplier, amount, active_ms, pull_request_id,
          repository, number, finding_id, comment_id, category, character_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      reward.key(repository, pullRequest.number),
      reward.reason,
      reward.baseXp,
      multiplier,
      Math.round(reward.baseXp * multiplier),
      activeMs,
      reward.pullRequestId,
      repository,
      pullRequest.number,
      reward.findingId ?? null,
      reward.commentId ?? null,
      reward.category ?? null,
      character.success ? character.data : getActiveCharacter(db),
    );
  if (changes === 0) return false;
  unlockAchievements(db);
  return true;
}

// Once per pull request, however many rounds it takes. The key uses the repository and
// number, so a pull request that closes and comes back can't earn it twice.
export function awardReviewCompletion(db: DatabaseSync, pullRequestId: number): boolean {
  return award(db, {
    key: (repository, number) => `review:${repository.toLowerCase()}#${number}`,
    reason: 'review-completed',
    baseXp: REVIEW_COMPLETED_XP,
    pullRequestId,
  });
}

// A finding earns XP once an agent validated it and the reviewer marked it resolved, in
// either order. Changing either back later keeps the XP.
export function awardFinding(db: DatabaseSync, findingId: number): boolean {
  const finding = db
    .prepare(
      `SELECT pull_request_id, category FROM review_findings
       WHERE id = ? AND validation = 'validated' AND resolution = 'resolved'`,
    )
    .get(findingId) as { pull_request_id: number; category: FindingCategory } | undefined;
  if (!finding) return false;
  return award(db, {
    key: () => `finding:${findingId}`,
    reason: 'finding-resolved',
    baseXp: findingXp[finding.category],
    pullRequestId: finding.pull_request_id,
    findingId,
    category: finding.category,
  });
}

// A sent line comment earns XP the same way, once its category is set. The category is fixed
// once the comment is sent.
export function awardComment(db: DatabaseSync, commentId: number): boolean {
  const comment = db
    .prepare(
      `SELECT pull_request_id, category FROM review_comments
       WHERE id = ? AND category IS NOT NULL AND validation = 'validated'
         AND resolution = 'resolved'`,
    )
    .get(commentId) as { pull_request_id: number; category: FindingCategory } | undefined;
  if (!comment) return false;
  return award(db, {
    key: () => `comment:${commentId}`,
    reason: 'comment-resolved',
    baseXp: findingXp[comment.category],
    pullRequestId: comment.pull_request_id,
    commentId,
    category: comment.category,
  });
}

// Marks the findings and comments the agent fixed as validated, then awards the ones already
// resolved. The report names findings F1, F2, … in id order and comments C1, C2, … in the
// order they were sent, as the task context gave them.
export function validateReport(db: DatabaseSync, taskId: number, report: AgentReport): void {
  const row = db
    .prepare(
      `SELECT s.id, s.finding_ids FROM agent_tasks t
       JOIN review_submissions s ON s.id = t.submission_id WHERE t.id = ?`,
    )
    .get(taskId) as { id: string; finding_ids: string } | undefined;
  if (!row) return;
  const findingIds = (JSON.parse(row.finding_ids) as number[]).sort((a, b) => a - b);
  for (const item of report.items) {
    if (item.outcome !== 'fixed') continue;
    const match = /^([FC])(\d+)$/.exec(item.id);
    if (!match) continue;
    const number = Number(match[2]);
    if (match[1] === 'F') {
      const findingId = findingIds[number - 1];
      if (findingId === undefined) continue;
      db.prepare(
        `UPDATE review_findings
         SET validation = 'validated', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND validation = 'pending'`,
      ).run(findingId);
      awardFinding(db, findingId);
    } else {
      const comment = db
        .prepare('SELECT id FROM review_comments WHERE submission_id = ? AND position = ?')
        .get(row.id, number) as { id: number } | undefined;
      if (!comment) continue;
      db.prepare(
        "UPDATE review_comments SET validation = 'validated' WHERE id = ? AND validation = 'pending'",
      ).run(comment.id);
      awardComment(db, comment.id);
    }
  }
}

interface XpTransactionRow {
  id: number;
  reason: XpTransaction['reason'];
  base_xp: number;
  multiplier: number;
  amount: number;
  active_ms: number;
  pull_request_id: number;
  repository: string;
  number: number;
  finding_id: number | null;
  comment_id: number | null;
  category: XpTransaction['category'];
  character_id: XpTransaction['characterId'];
  created_at: string;
}

// A pull request's awards, oldest first.
export function listXpTransactions(db: DatabaseSync, pullRequestId: number): XpTransaction[] {
  const rows = db
    .prepare('SELECT * FROM xp_transactions WHERE pull_request_id = ? ORDER BY id')
    .all(pullRequestId) as unknown as XpTransactionRow[];
  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    baseXp: row.base_xp,
    multiplier: row.multiplier,
    amount: row.amount,
    activeMs: row.active_ms,
    pullRequestId: row.pull_request_id,
    repository: row.repository,
    number: row.number,
    findingId: row.finding_id,
    commentId: row.comment_id,
    category: row.category,
    characterId: row.character_id,
    createdAt: row.created_at,
  }));
}
