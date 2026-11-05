import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { finishReview } from '../pull-requests/completions.ts';
import { createReviewFinding, setReviewFindingResolution } from '../pull-requests/findings.ts';
import { reviewTimeMultiplier } from '../../../shared/contracts/progression.ts';
import {
  addReviewTime,
  awardFinding,
  awardReviewCompletion,
  getProgression,
  listXpTransactions,
  MAX_REVIEW_TIME_REPORT_MS,
  setActiveCharacter,
  setOutfit,
  setWeapon,
  startReviewProgress,
  validateReport,
} from './xp.ts';
import { listAchievements } from './achievements.ts';

let db: ReturnType<typeof openDatabase>;
let pullRequestId: number;

function insertPullRequest(number: number): number {
  const repository = db.prepare('SELECT id FROM repositories').get() as { id: number };
  db.prepare(
    `INSERT INTO pull_requests
       (repository_id, provider_id, number, title, draft, url, head_branch, head_sha, base_branch,
        created_at, updated_at)
     VALUES (?, ?, ?, 'Title', 0, 'https://example.test', 'feature', 'headsha', 'main', 'a', 'b')`,
  ).run(repository.id, String(number), number);
  return (db.prepare('SELECT id FROM pull_requests WHERE number = ?').get(number) as { id: number })
    .id;
}

function addFinding(category: 'bug' | 'security' | 'test'): number {
  createReviewFinding(db, { pullRequestId, category, description: 'Broken', steps: '' });
  return (db.prepare('SELECT MAX(id) AS id FROM review_findings').get() as { id: number }).id;
}

function addTask(findingIds: number[]): number {
  db.prepare(
    `INSERT INTO review_submissions
       (id, pull_request_id, head_sha, verdict, body, comments, draft_ids, finding_ids,
        send_to_agent)
     VALUES ('s1', ?, 'headsha', 'comment', '', '[]', '[]', ?, 1)`,
  ).run(pullRequestId, JSON.stringify(findingIds));
  db.prepare("INSERT INTO agent_tasks (submission_id, pull_request_id) VALUES ('s1', ?)").run(
    pullRequestId,
  );
  return (db.prepare('SELECT id FROM agent_tasks').get() as { id: number }).id;
}

const report = (items: { id: string; outcome: 'fixed' | 'not_fixed' }[]) => ({
  items: items.map((item) => ({ ...item, note: '' })),
  tests: [],
  summary: '',
});

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  reconcileRepositories(db, [
    {
      path: '/code/app',
      name: 'app',
      remoteUrl: 'git@github.com:octo/app.git',
      rootCommit: 'root',
    },
  ]);
  pullRequestId = insertPullRequest(7);
});

describe('review time multiplier', () => {
  it('follows the brackets up to 1.5', () => {
    expect(reviewTimeMultiplier(0)).toBe(1);
    expect(reviewTimeMultiplier(4 * 60_000)).toBe(1);
    expect(reviewTimeMultiplier(5 * 60_000)).toBe(1.1);
    expect(reviewTimeMultiplier(20 * 60_000)).toBe(1.25);
    expect(reviewTimeMultiplier(45 * 60_000)).toBe(1.4);
    expect(reviewTimeMultiplier(600 * 60_000)).toBe(1.5);
  });
});

describe('review completion XP', () => {
  it('awards 20 XP once per pull request', () => {
    finishReview(db, pullRequestId);
    finishReview(db, pullRequestId);
    expect(listXpTransactions(db, pullRequestId)).toMatchObject([
      { reason: 'review-completed', baseXp: 20, multiplier: 1, amount: 20, characterId: 'shadow' },
    ]);
    expect(getProgression(db).account).toEqual({
      xp: 20,
      level: 1,
      levelXp: 20,
      nextLevelXp: 1000,
    });
  });

  it('is not awarded again when the pull request comes back as a new row', () => {
    expect(awardReviewCompletion(db, pullRequestId)).toBe(true);
    db.prepare('DELETE FROM pull_requests WHERE id = ?').run(pullRequestId);
    const again = insertPullRequest(7);
    expect(awardReviewCompletion(db, again)).toBe(false);
    expect(getProgression(db).account.xp).toBe(20);
  });

  it('scales with active review time and keeps the amount it was given', () => {
    for (let i = 0; i < 20; i++) addReviewTime(db, pullRequestId, 60_000);
    awardReviewCompletion(db, pullRequestId);
    for (let i = 0; i < 60; i++) addReviewTime(db, pullRequestId, 60_000);
    expect(listXpTransactions(db, pullRequestId)).toMatchObject([
      { multiplier: 1.25, amount: 25, activeMs: 20 * 60_000 },
    ]);
  });

  it('unlocks the achievements it completes', () => {
    finishReview(db, pullRequestId);
    expect(listAchievements(db).find((item) => item.id === 'first-review')?.earnedAt).toBeTruthy();
  });

  it('keeps XP after the pull request closes', () => {
    awardReviewCompletion(db, pullRequestId);
    db.prepare('DELETE FROM pull_requests WHERE id = ?').run(pullRequestId);
    expect(getProgression(db).account.xp).toBe(20);
  });
});

describe('review time', () => {
  it('caps each report and ignores negative time', () => {
    addReviewTime(db, pullRequestId, 10 * 60_000);
    addReviewTime(db, pullRequestId, -5);
    expect(db.prepare('SELECT active_ms FROM review_progress').get()).toEqual({
      active_ms: MAX_REVIEW_TIME_REPORT_MS,
    });
  });
});

describe('characters', () => {
  it('gives the review to the character active when it opened', () => {
    startReviewProgress(db, pullRequestId);
    db.prepare("UPDATE account_progress SET active_character = 'ember'").run();
    startReviewProgress(db, pullRequestId);
    awardReviewCompletion(db, pullRequestId);
    expect(listXpTransactions(db, pullRequestId)[0]?.characterId).toBe('shadow');
  });

  it('refuses a locked character and unlocks one at its account level', () => {
    expect(() => setActiveCharacter(db, 'ember')).toThrow('locked');
    db.prepare(
      `INSERT INTO xp_transactions
         (reward_key, reason, base_xp, multiplier, amount, active_ms, pull_request_id,
          repository, number, character_id)
       VALUES ('seed', 'review-completed', 2000, 1, 2000, 0, 1, 'octo/app', 1, 'shadow')`,
    ).run();
    const progression = setActiveCharacter(db, 'ember');
    expect(progression.activeCharacter).toBe('ember');
    expect(progression.account.level).toBe(3);
    expect(progression.characters.map((character) => character.unlocked)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(progression.characters[0]).toMatchObject({ xp: 2000, level: 5, levelXp: 0 });
  });
});

describe('outfits', () => {
  it('wears the default until a character level unlocks another', () => {
    expect(getProgression(db).characters[0]?.outfit).toBe('default');
    expect(() => setOutfit(db, 'shadow', 'teal')).toThrow('locked');
    db.prepare(
      `INSERT INTO xp_transactions
         (reward_key, reason, base_xp, multiplier, amount, active_ms, pull_request_id,
          repository, number, character_id)
       VALUES ('seed', 'review-completed', 1000, 1, 1000, 0, 1, 'octo/app', 1, 'shadow')`,
    ).run();
    expect(setOutfit(db, 'shadow', 'teal').characters[0]?.outfit).toBe('teal');
    expect(() => setOutfit(db, 'shadow', 'crimson')).toThrow('locked');
    expect(() => setOutfit(db, 'ember', 'default')).toThrow('locked');
  });

  it('gives each character its own outfits', () => {
    db.prepare(
      `INSERT INTO xp_transactions
         (reward_key, reason, base_xp, multiplier, amount, active_ms, pull_request_id,
          repository, number, character_id)
       VALUES ('seed', 'review-completed', 2000, 1, 2000, 0, 1, 'octo/app', 1, 'ember')`,
    ).run();
    const ember = () => getProgression(db).characters.find(({ id }) => id === 'ember');
    expect(ember()?.outfit).toBe('default');
    expect(() => setOutfit(db, 'ember', 'teal')).toThrow('locked');
    expect(() => setOutfit(db, 'ember', 'black-pink')).toThrow('locked');
    setOutfit(db, 'ember', 'green');
    expect(ember()?.outfit).toBe('green');
  });
});

describe('weapons', () => {
  it('holds the dagger until a character level unlocks another, whatever the outfit', () => {
    expect(getProgression(db).characters[0]?.weapon).toBe('dagger');
    expect(() => setWeapon(db, 'shadow', 'void-crescent')).toThrow('locked');
    db.prepare(
      `INSERT INTO xp_transactions
         (reward_key, reason, base_xp, multiplier, amount, active_ms, pull_request_id,
          repository, number, character_id)
       VALUES ('seed', 'review-completed', 1000, 1, 1000, 0, 1, 'octo/app', 1, 'shadow')`,
    ).run();
    setOutfit(db, 'shadow', 'teal');
    expect(setWeapon(db, 'shadow', 'void-crescent').characters[0]).toMatchObject({
      outfit: 'teal',
      weapon: 'void-crescent',
    });
    expect(() => setWeapon(db, 'shadow', 'sunfang')).toThrow('locked');
    expect(() => setWeapon(db, 'ember', 'dagger')).toThrow('locked');
  });

  it('gives each character its own weapons', () => {
    db.prepare(
      `INSERT INTO xp_transactions
         (reward_key, reason, base_xp, multiplier, amount, active_ms, pull_request_id,
          repository, number, character_id)
       VALUES ('seed', 'review-completed', 2000, 1, 2000, 0, 1, 'octo/app', 1, 'ember')`,
    ).run();
    const ember = () => getProgression(db).characters.find(({ id }) => id === 'ember');
    expect(ember()?.weapon).toBe('crystal-scepter');
    expect(() => setWeapon(db, 'ember', 'dagger')).toThrow('locked');
  });
});

describe('finding XP', () => {
  it('needs the agent to fix it and the reviewer to resolve it, in either order', () => {
    const bug = addFinding('bug');
    const security = addFinding('security');
    const taskId = addTask([bug, security]);

    setReviewFindingResolution(db, { pullRequestId, id: bug, resolution: 'resolved' });
    expect(listXpTransactions(db, pullRequestId)).toEqual([]);
    validateReport(
      db,
      taskId,
      report([
        { id: 'F1', outcome: 'fixed' },
        { id: 'F2', outcome: 'fixed' },
      ]),
    );
    expect(listXpTransactions(db, pullRequestId)).toMatchObject([
      { reason: 'finding-resolved', findingId: bug, amount: 50 },
    ]);
    setReviewFindingResolution(db, { pullRequestId, id: security, resolution: 'resolved' });
    expect(listXpTransactions(db, pullRequestId).map((xp) => xp.amount)).toEqual([50, 100]);
  });

  it('is not awarded for a finding the agent did not fix', () => {
    const test = addFinding('test');
    const taskId = addTask([test]);
    validateReport(db, taskId, report([{ id: 'F1', outcome: 'not_fixed' }]));
    setReviewFindingResolution(db, { pullRequestId, id: test, resolution: 'resolved' });
    expect(listXpTransactions(db, pullRequestId)).toEqual([]);
  });

  it('is awarded once and kept when the finding is reopened', () => {
    const test = addFinding('test');
    validateReport(db, addTask([test]), report([{ id: 'F1', outcome: 'fixed' }]));
    setReviewFindingResolution(db, { pullRequestId, id: test, resolution: 'resolved' });
    setReviewFindingResolution(db, { pullRequestId, id: test, resolution: 'open' });
    setReviewFindingResolution(db, { pullRequestId, id: test, resolution: 'resolved' });
    expect(awardFinding(db, test)).toBe(false);
    expect(listXpTransactions(db, pullRequestId).map((xp) => xp.amount)).toEqual([25]);
  });
});
