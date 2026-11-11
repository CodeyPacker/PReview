import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { migrations } from '../../database/migrations.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { clearReviewData } from './clear-review-data.ts';
import { TourStore } from './tour-store.ts';
import { SavedTours } from './saved-tours.ts';
import { Tours, tourOutlineSchema } from './tours.ts';

const plan = {
  title: 'Review changes',
  summary: 'Two connected changes.',
  stops: ['a.ts', 'b.ts'].map((file) => ({
    file,
    start: 1,
    end: 2,
    group: 'Core',
    title: file,
    body: 'What changed.',
  })),
};
let db: ReturnType<typeof openDatabase>;
let store: TourStore;
let input: { pullRequestId: number; headSha: string; mergeBase: string };

function seed() {
  reconcileRepositories(db, [
    {
      path: '/code/app',
      name: 'app',
      remoteUrl: 'git@github.com:octo/app.git',
      rootCommit: 'root',
    },
  ]);
  const { id } = db.prepare('SELECT id FROM repositories').get() as { id: number };
  const result = db
    .prepare(
      `INSERT INTO pull_requests
    (repository_id, provider_id, number, title, draft, url, head_branch, head_sha, base_branch, created_at, updated_at)
    VALUES (?, '1234', 7, 'Title', 0, 'https://github.com/octo/app/pull/7', 'feature', ?, 'main', 'a', 'b')`,
    )
    .run(id, 'a'.repeat(40));
  input = {
    pullRequestId: Number(result.lastInsertRowid),
    headSha: 'a'.repeat(40),
    mergeBase: 'b'.repeat(40),
  };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  seed();
  store = new TourStore(db);
});
afterEach(() => db.close());
const create = () => store.create(input, store.identity(input.pullRequestId), plan, 1234);

describe('saved tour storage', () => {
  it('does not count a generated tour as viewed until the reader opens a stop', () => {
    const saved = create();
    expect(saved.visitedStops).toBe(0);
    expect(db.prepare('SELECT started_at FROM tours WHERE id = ?').get(saved.id)).toMatchObject({
      started_at: null,
    });
    store.progress({ tourId: saved.id, stopIndex: 0 });
    expect(store.get(saved.id).visitedStops).toBe(1);
    expect(db.prepare('SELECT started_at FROM tours WHERE id = ?').get(saved.id)).not.toMatchObject(
      { started_at: null },
    );
  });

  it('persists the plan, current stop, visited stops, answer types and statistics', () => {
    const saved = create();
    store.progress({ tourId: saved.id, stopIndex: 0 });
    store.progress({ tourId: saved.id, stopIndex: 1, activeMs: 5000 });
    const message = store.beginMessage(saved.id, 1, 'deeper', 'Explain more');
    store.finishMessage(message, 'Details', null, 200);
    const result = store.get(saved.id);
    expect(result.plan).toEqual(plan);
    expect(result).toMatchObject({
      currentStop: 1,
      visitedStops: 2,
      activeMs: 5000,
      generationMs: 1234,
      completedAt: null,
    });
    expect(result.messages).toMatchObject([
      {
        stopIndex: 1,
        kind: 'deeper',
        question: 'Explain more',
        answer: 'Details',
        durationMs: 200,
        status: 'completed',
      },
    ]);
    expect(store.list(input)[0]?.id).toBe(saved.id);
  });

  it('ignores repeated or late time totals and distinguishes exit from completion', () => {
    const saved = create();
    store.progress({ tourId: saved.id, activeMs: 5000 });
    store.progress({ tourId: saved.id, activeMs: 5000 });
    store.progress({ tourId: saved.id, activeMs: 2000 });
    expect(store.get(saved.id)).toMatchObject({ activeMs: 5000, completedAt: null });
    store.progress({ tourId: saved.id, complete: true });
    const completed = store.get(saved.id).completedAt;
    expect(completed).not.toBeNull();
    store.progress({ tourId: saved.id, complete: true });
    expect(store.get(saved.id).completedAt).toBe(completed);
  });

  it('keeps generations and returns the latest matching snapshot per provider and depth', () => {
    const first = create();
    const second = create();
    const codex = store.create(
      { ...input, provider: 'codex', depth: 'deep' },
      store.identity(input.pullRequestId),
      plan,
      55,
    );
    expect(store.list(input).map((tour) => tour.id)).toEqual([codex.id, second.id]);
    expect(store.get(first.id).plan).toEqual(plan);
    expect(store.list({ ...input, headSha: 'c'.repeat(40) })).toEqual([]);
    expect(() => store.require({ ...input, mergeBase: 'c'.repeat(40), tourId: first.id })).toThrow(
      'does not match',
    );
  });

  it('retains history when a closed PR is pruned and finds it if that PR reopens', () => {
    const saved = create();
    db.prepare('DELETE FROM pull_requests WHERE id = ?').run(input.pullRequestId);
    expect(store.get(saved.id).plan).toEqual(plan);
    seed();
    expect(store.list(input)[0]?.id).toBe(saved.id);
  });

  it('rejects invalid stops without changing progress', () => {
    const saved = create();
    expect(() => store.progress({ tourId: saved.id, stopIndex: 79, activeMs: 999 })).toThrow(
      'not in the saved tour',
    );
    expect(store.get(saved.id)).toMatchObject({ currentStop: 0, activeMs: 0, visitedStops: 0 });
  });

  it('marks interrupted answers as failed on startup', () => {
    const saved = create();
    store.beginMessage(saved.id, 0, 'ask', 'Why?');
    const reopened = new TourStore(db);
    expect(reopened.get(saved.id).messages[0]).toMatchObject({ status: 'failed', answer: null });
  });

  it('clears tours and messages with review data and refuses while an answer is pending', () => {
    const saved = create();
    const message = store.beginMessage(saved.id, 0, 'technical', 'How?');
    expect(clearReviewData(db)).toEqual({ status: 'busy' });
    store.finishMessage(message, 'Explanation', null, 123);
    expect(clearReviewData(db)).toEqual({ status: 'cleared' });
    expect(db.prepare('SELECT id FROM tours').all()).toEqual([]);
    expect(db.prepare('SELECT tour_id FROM tour_stops').all()).toEqual([]);
    expect(db.prepare('SELECT id FROM tour_messages').all()).toEqual([]);
  });

  it('upgrades an existing database without removing review data', () => {
    const previous = openDatabase(':memory:');
    try {
      migrate(
        previous,
        migrations.filter((migration) => migration.version <= 30),
      );
      previous.prepare("INSERT INTO settings (key, value) VALUES ('test', 'kept')").run();
      expect(migrate(previous)).toBe(32);
      expect(previous.prepare("SELECT value FROM settings WHERE key = 'test'").get()).toMatchObject(
        { value: 'kept' },
      );
      expect(previous.prepare('SELECT COUNT(*) AS count FROM tours').get()).toMatchObject({
        count: 0,
      });
    } finally {
      previous.close();
    }
  });

  it('survives a database reopen and is included in SQLite backups', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'preview-tour-storage-'));
    const original = db;
    try {
      const path = join(dir, 'preview.db');
      db = openDatabase(path);
      migrate(db);
      seed();
      store = new TourStore(db);
      const saved = create();
      store.progress({ tourId: saved.id, stopIndex: 1, activeMs: 9876 });
      const message = store.beginMessage(saved.id, 1, 'ask', 'Why?');
      store.finishMessage(message, 'Because.', null, 100);
      const expected = store.get(saved.id);
      const backup = join(dir, 'backup.db');
      db.prepare('VACUUM INTO ?').run(backup);
      db.close();
      db = openDatabase(path);
      migrate(db);
      expect(new TourStore(db).get(saved.id)).toEqual(expected);
      const restored = openDatabase(backup);
      try {
        expect(new TourStore(restored).get(saved.id)).toEqual(expected);
      } finally {
        restored.close();
      }
      db.close();
    } finally {
      db = original;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('saved tour provider work', () => {
  it('keeps identical files, order and ranges across depths, including concurrent requests', async () => {
    const run = vi
      .fn<(prompt: string, schema: unknown, provider: string) => Promise<unknown>>()
      .mockImplementation((prompt, schema) => {
        if (schema === tourOutlineSchema) return Promise.resolve(plan);
        const depth = /Explanation depth: (\w+)/.exec(prompt)?.[1] ?? 'unknown';
        return Promise.resolve({
          summary: `${depth} summary`,
          bodies: plan.stops.map(() => `${depth} explanation`),
        });
      });
    const files = {
      list: vi.fn().mockResolvedValue({
        ...input,
        files: plan.stops.map((stop) => ({
          path: stop.file,
          previousPath: null,
          status: 'modified',
          hunks: null,
        })),
      }),
      getDescription: vi.fn().mockResolvedValue('Changes'),
      getDiff: vi.fn().mockResolvedValue({
        original: 'old\ncode',
        modified: 'new\ncode',
        unavailable: null,
        images: null,
      }),
    };
    const tours = new SavedTours(store, new Tours(files, run));
    const depths = ['overview', 'normal', 'deep'] as const;
    const results = await Promise.all(depths.map((depth) => tours.start({ ...input, depth })));
    for (const [index, saved] of results.entries()) {
      expect(tourOutlineSchema.parse(saved.plan)).toEqual(tourOutlineSchema.parse(plan));
      expect(saved.plan.stops.map((stop) => stop.body)).toEqual(
        plan.stops.map(() => `${depths[index]} explanation`),
      );
    }
    expect(run.mock.calls.filter((call) => call[1] === tourOutlineSchema)).toHaveLength(1);
    expect(store.list(input)).toHaveLength(3);
  });

  it('retains legacy tours as history and reuses their stop list for new explanations', async () => {
    const legacy = create();
    db.prepare('UPDATE tours SET outline_version = 0 WHERE id = ?').run(legacy.id);
    expect(store.list(input)).toEqual([]);
    expect(store.get(legacy.id).plan).toEqual(plan);
    const provider = engine();
    const tours = new SavedTours(store, provider);
    const saved = await tours.start({ ...input, depth: 'overview' });
    expect(provider.start).toHaveBeenCalledWith(expect.anything(), plan);
    expect(store.list(input).map((tour) => tour.id)).toEqual([saved.id]);
    expect(store.get(legacy.id).plan).toEqual(plan);
  });

  function engine() {
    return {
      start: vi.fn<Tours['start']>().mockResolvedValue(plan),
      ask: vi.fn<Tours['ask']>().mockResolvedValue('Answer'),
      snapshot: vi
        .fn<Tours['snapshot']>()
        .mockResolvedValue({ headSha: input.headSha, mergeBase: input.mergeBase, files: [] }),
    };
  }

  it('resumes without regenerating and uses saved provider, stop and history for answers', async () => {
    const provider = engine();
    const tours = new SavedTours(store, provider);
    const saved = await tours.start({ ...input, provider: 'codex', depth: 'deep' });
    store.progress({ tourId: saved.id, stopIndex: 1 });
    expect((await tours.resume({ ...input, tourId: saved.id })).currentStop).toBe(1);
    expect(provider.start).toHaveBeenCalledOnce();
    await tours.ask({ ...input, tourId: saved.id, stopIndex: 1, question: 'Why?', kind: 'ask' });
    await tours.ask({
      ...input,
      tourId: saved.id,
      stopIndex: 1,
      question: 'More?',
      kind: 'technical',
      provider: 'claude',
    });
    expect(provider.ask.mock.calls[1]?.[0]).toMatchObject({
      provider: 'codex',
      depth: 'deep',
      stop: plan.stops[1],
      history: [{ question: 'Why?', answer: 'Answer' }],
    });
    expect(store.get(saved.id).messages.map((message) => message.kind)).toEqual([
      'ask',
      'technical',
    ]);
  });

  it('records failed answers and clears its busy status', async () => {
    const provider = engine();
    const tours = new SavedTours(store, provider);
    const saved = await tours.start(input);
    provider.ask.mockRejectedValue(new Error('Usage limit'));
    await expect(
      tours.ask({ ...input, tourId: saved.id, stopIndex: 0, question: 'Why?', kind: 'ask' }),
    ).rejects.toThrow('Usage limit');
    expect(store.get(saved.id).messages[0]).toMatchObject({
      status: 'failed',
      error: 'Usage limit',
    });
    expect(tours.busy).toBe(false);
  });

  it('refuses to resume when the PR has moved', async () => {
    const provider = engine();
    const tours = new SavedTours(store, provider);
    const saved = await tours.start(input);
    provider.snapshot.mockRejectedValue(new Error('The PR changed'));
    await expect(tours.resume({ ...input, tourId: saved.id })).rejects.toThrow('PR changed');
    expect(store.get(saved.id).visitedStops).toBe(0);
  });
});
