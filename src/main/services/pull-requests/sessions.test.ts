import { beforeEach, describe, expect, it } from 'vitest';
import { ipcContract } from '../../../shared/contracts/ipc.ts';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import {
  getActiveReview,
  getReviewSession,
  saveReviewSession,
  setActiveReview,
} from './sessions.ts';

let db: ReturnType<typeof openDatabase>;
let pullRequestIds: number[];

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
  const repository = db.prepare('SELECT id FROM repositories').get() as { id: number };
  const insert = db.prepare(
    `INSERT INTO pull_requests
       (repository_id, provider_id, number, title, draft, url, head_branch, head_sha, base_branch,
        created_at, updated_at)
     VALUES (?, ?, ?, 'Title', 0, 'https://example.test', 'feature', 'headsha', 'main', 'a', 'b')`,
  );
  insert.run(repository.id, '10', 7);
  insert.run(repository.id, '11', 8);
  pullRequestIds = (
    db.prepare('SELECT id FROM pull_requests ORDER BY number').all() as {
      id: number;
    }[]
  ).map((row) => row.id);
});

describe('review sessions', () => {
  it('has no session before a pull request is opened', () => {
    const [first] = pullRequestIds as [number];
    expect(getReviewSession(db, first)).toBeNull();
    expect(getActiveReview(db)).toBeNull();
  });

  it('saves and replaces where the reviewer left off', () => {
    const [first, second] = pullRequestIds as [number, number];
    saveReviewSession(db, {
      pullRequestId: first,
      selectedPath: 'src/a.ts',
      scrollTop: 120,
      diffMode: 'unified',
    });
    saveReviewSession(db, {
      pullRequestId: first,
      selectedPath: 'src/b.ts',
      scrollTop: 40,
      diffMode: 'split',
    });

    expect(getReviewSession(db, first)).toEqual({
      pullRequestId: first,
      selectedPath: 'src/b.ts',
      scrollTop: 40,
      diffMode: 'split',
    });
    expect(getReviewSession(db, second)).toBeNull();
  });

  it('keeps one active review and starts a new session with defaults', () => {
    const [first, second] = pullRequestIds as [number, number];
    setActiveReview(db, first);
    setActiveReview(db, second);

    expect(getActiveReview(db)).toBe(second);
    expect(getReviewSession(db, second)).toEqual({
      pullRequestId: second,
      selectedPath: null,
      scrollTop: 0,
      diffMode: 'split',
    });

    setActiveReview(db, null);
    expect(getActiveReview(db)).toBeNull();
  });

  it('keeps the active mark when the session is saved', () => {
    const [first] = pullRequestIds as [number];
    setActiveReview(db, first);
    saveReviewSession(db, {
      pullRequestId: first,
      selectedPath: 'a',
      scrollTop: 0,
      diffMode: 'split',
    });
    expect(getActiveReview(db)).toBe(first);
  });

  it('goes with its pull request', () => {
    const [first] = pullRequestIds as [number];
    setActiveReview(db, first);
    db.prepare('DELETE FROM pull_requests WHERE id = ?').run(first);
    expect(getReviewSession(db, first)).toBeNull();
    expect(getActiveReview(db)).toBeNull();
  });

  it('rejects a negative scroll position and an unknown diff mode', () => {
    const save = ipcContract['reviewSessions.save'].input;
    const session = { pullRequestId: 1, selectedPath: null, scrollTop: 0, diffMode: 'split' };
    expect(save.safeParse(session).success).toBe(true);
    expect(save.safeParse({ ...session, scrollTop: -1 }).success).toBe(false);
    expect(save.safeParse({ ...session, diffMode: 'inline' }).success).toBe(false);
  });
});
