import { beforeEach, describe, expect, it } from 'vitest';
import { ipcContract } from '../../../shared/contracts/ipc.ts';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import {
  createReviewDraft,
  deleteReviewDraft,
  listReviewDrafts,
  updateReviewDraft,
} from './drafts.ts';

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

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

function draft(
  pullRequestId: number,
  line: number,
  body = 'Check this.',
  startLine: number | null = null,
) {
  return {
    pullRequestId,
    headSha: HEAD,
    mergeBase: BASE,
    path: 'src/app.ts',
    side: 'modified' as const,
    startLine,
    line,
    body,
  };
}

describe('review drafts', () => {
  it('keeps each pull request’s drafts apart', () => {
    const [first, second] = pullRequestIds as [number, number];
    createReviewDraft(db, draft(first, 3));
    createReviewDraft(db, draft(second, 9));

    expect(listReviewDrafts(db, first)).toMatchObject([
      {
        pullRequestId: first,
        headSha: HEAD,
        mergeBase: BASE,
        path: 'src/app.ts',
        side: 'modified',
        startLine: null,
        line: 3,
        body: 'Check this.',
      },
    ]);
    expect(listReviewDrafts(db, second)).toMatchObject([{ line: 9 }]);
  });

  it('keeps the first line of a comment on several lines', () => {
    const [first] = pullRequestIds as [number];

    expect(createReviewDraft(db, draft(first, 8, 'Split this.', 5))).toMatchObject([
      { startLine: 5, line: 8 },
    ]);
  });

  it('edits a draft', () => {
    const [first] = pullRequestIds as [number];
    const [created] = createReviewDraft(db, draft(first, 3));

    expect(
      updateReviewDraft(db, { pullRequestId: first, id: created!.id, body: 'Rename this.' }),
    ).toMatchObject([{ id: created!.id, body: 'Rename this.' }]);
  });

  it('refuses to edit a draft through another pull request', () => {
    const [first, second] = pullRequestIds as [number, number];
    const [created] = createReviewDraft(db, draft(first, 3));

    expect(() =>
      updateReviewDraft(db, { pullRequestId: second, id: created!.id, body: 'Hijack.' }),
    ).toThrow('Draft not found.');
    expect(listReviewDrafts(db, first)).toMatchObject([{ body: 'Check this.' }]);
  });

  it('deletes a draft, and deleting it again changes nothing', () => {
    const [first] = pullRequestIds as [number];
    const [kept] = createReviewDraft(db, draft(first, 3));
    const deleted = createReviewDraft(db, draft(first, 5)).at(-1)!;

    expect(deleteReviewDraft(db, first, deleted.id)).toMatchObject([{ id: kept!.id }]);
    expect(deleteReviewDraft(db, first, deleted.id)).toMatchObject([{ id: kept!.id }]);
  });

  it('removes drafts with their pull request', () => {
    const [first] = pullRequestIds as [number];
    createReviewDraft(db, draft(first, 3));
    db.prepare('DELETE FROM pull_requests WHERE id = ?').run(first);

    expect(listReviewDrafts(db, first)).toEqual([]);
  });

  it('only accepts drafts with text', () => {
    const create = ipcContract['reviewDrafts.create'].input;

    expect(create.safeParse(draft(1, 3, '   ')).success).toBe(false);
    expect(create.safeParse(draft(1, 0)).success).toBe(false);
    expect(create.safeParse(draft(1, 5, 'Backwards.', 5)).success).toBe(false);
    expect(create.safeParse(draft(1, 5, 'Backwards.', 7)).success).toBe(false);
    expect(create.parse(draft(1, 3, '  Trim me.  ')).body).toBe('Trim me.');
  });
});
