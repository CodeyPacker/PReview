import { beforeEach, describe, expect, it } from 'vitest';
import { ipcContract } from '../../../shared/contracts/ipc.ts';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { listFileReviewMarks, setFileReviewMark } from './marks.ts';

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
    db.prepare('SELECT id FROM pull_requests ORDER BY number').all() as { id: number }[]
  ).map((row) => row.id);
});

describe('file review marks', () => {
  it('sets, replaces and removes a mark', () => {
    const [first, second] = pullRequestIds as [number, number];
    expect(listFileReviewMarks(db, first)).toEqual([]);

    setFileReviewMark(db, { pullRequestId: first, path: 'a.ts', state: 'approved', blobSha: 's1' });
    setFileReviewMark(db, { pullRequestId: second, path: 'a.ts', state: 'flagged', blobSha: 's9' });
    expect(
      setFileReviewMark(db, {
        pullRequestId: first,
        path: 'a.ts',
        state: 'flagged',
        blobSha: 's2',
      }),
    ).toEqual([{ path: 'a.ts', state: 'flagged', blobSha: 's2' }]);
    expect(listFileReviewMarks(db, second)).toHaveLength(1);

    expect(
      setFileReviewMark(db, { pullRequestId: first, path: 'a.ts', state: null, blobSha: 's2' }),
    ).toEqual([]);
    expect(listFileReviewMarks(db, second)).toHaveLength(1);
  });

  it('goes with its pull request', () => {
    const [first] = pullRequestIds as [number];
    setFileReviewMark(db, { pullRequestId: first, path: 'a.ts', state: 'approved', blobSha: 's1' });
    db.prepare('DELETE FROM pull_requests WHERE id = ?').run(first);
    expect(listFileReviewMarks(db, first)).toEqual([]);
  });

  it('rejects an unknown state', () => {
    const set = ipcContract['fileReviewMarks.set'].input;
    const mark = { pullRequestId: 1, path: 'a.ts', state: 'approved', blobSha: 's' };
    expect(set.safeParse(mark).success).toBe(true);
    expect(set.safeParse({ ...mark, state: null }).success).toBe(true);
    expect(set.safeParse({ ...mark, state: 'done' }).success).toBe(false);
  });
});
