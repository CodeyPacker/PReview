import { beforeEach, describe, expect, it } from 'vitest';
import { ipcContract } from '../../../shared/contracts/ipc.ts';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import {
  createReviewFinding,
  deleteReviewFinding,
  listReviewFindings,
  setReviewFindingResolution,
  updateReviewFinding,
} from './findings.ts';

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

function finding(pullRequestId: number, description = 'Crashes on save.', steps = '') {
  return { pullRequestId, category: 'bug' as const, description, steps };
}

function publish(id: number) {
  db.prepare("UPDATE review_findings SET published_at = 'then' WHERE id = ?").run(id);
}

describe('review findings', () => {
  it('keeps each pull request’s findings apart and starts them open and unchecked', () => {
    const [first, second] = pullRequestIds as [number, number];
    createReviewFinding(db, finding(first, ' Crashes on save. ', ' 1. Click save. '));
    createReviewFinding(db, finding(second, 'Other.'));

    expect(listReviewFindings(db, first)).toMatchObject([
      {
        pullRequestId: first,
        category: 'bug',
        description: 'Crashes on save.',
        steps: '1. Click save.',
        validation: 'pending',
        resolution: 'open',
        publishedAt: null,
      },
    ]);
    expect(listReviewFindings(db, second)).toMatchObject([{ description: 'Other.' }]);
  });

  it('edits an unpublished finding', () => {
    const [first] = pullRequestIds as [number];
    const [created] = createReviewFinding(db, finding(first));

    expect(
      updateReviewFinding(db, {
        ...finding(first, 'Crashes on load.', 'Open it.'),
        id: created!.id,
        category: 'security',
      }),
    ).toMatchObject([{ category: 'security', description: 'Crashes on load.', steps: 'Open it.' }]);
  });

  it('refuses to edit a published finding or one of another pull request', () => {
    const [first, second] = pullRequestIds as [number, number];
    const [created] = createReviewFinding(db, finding(first));

    expect(() =>
      updateReviewFinding(db, { ...finding(second, 'Hijack.'), id: created!.id }),
    ).toThrow();
    publish(created!.id);
    expect(() =>
      updateReviewFinding(db, { ...finding(first, 'Late.'), id: created!.id }),
    ).toThrow();
    expect(listReviewFindings(db, first)).toMatchObject([{ description: 'Crashes on save.' }]);
  });

  it('resolves and reopens a finding, published or not', () => {
    const [first] = pullRequestIds as [number];
    const [created] = createReviewFinding(db, finding(first));
    publish(created!.id);
    const change = { pullRequestId: first, id: created!.id };

    expect(setReviewFindingResolution(db, { ...change, resolution: 'resolved' })).toMatchObject([
      { resolution: 'resolved' },
    ]);
    expect(setReviewFindingResolution(db, { ...change, resolution: 'open' })).toMatchObject([
      { resolution: 'open' },
    ]);
  });

  it('deletes only unpublished findings', () => {
    const [first] = pullRequestIds as [number];
    const [kept] = createReviewFinding(db, finding(first));
    const deleted = createReviewFinding(db, finding(first, 'Gone.')).at(-1)!;
    publish(kept!.id);

    expect(deleteReviewFinding(db, first, deleted.id)).toMatchObject([{ id: kept!.id }]);
    expect(deleteReviewFinding(db, first, kept!.id)).toMatchObject([{ id: kept!.id }]);
  });

  it('removes findings with their pull request', () => {
    const [first] = pullRequestIds as [number];
    createReviewFinding(db, finding(first));
    db.prepare('DELETE FROM pull_requests WHERE id = ?').run(first);

    expect(listReviewFindings(db, first)).toEqual([]);
  });

  it('only accepts findings with a description', () => {
    const create = ipcContract['reviewFindings.create'].input;

    expect(create.safeParse(finding(1, '   ')).success).toBe(false);
    expect(create.safeParse({ ...finding(1), category: 'typo' }).success).toBe(false);
    expect(create.parse(finding(1, '  Trim me.  ')).description).toBe('Trim me.');
  });
});
