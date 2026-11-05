import { beforeEach, describe, expect, it } from 'vitest';
import { ipcContract } from '../../../shared/contracts/ipc.ts';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import {
  createReviewFinding,
  deleteReviewFinding,
  getFindingScreenshot,
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
  return {
    pullRequestId,
    category: 'bug' as const,
    description,
    steps,
    screenshotIds: [] as number[],
    newScreenshots: [] as string[],
  };
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

describe('finding screenshots', () => {
  const webp = (fill: number) => {
    const bytes = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
      Buffer.alloc(8, fill),
    ]);
    return `data:image/webp;base64,${bytes.toString('base64')}`;
  };

  function withScreenshots(...newScreenshots: string[]) {
    const [saved] = createReviewFinding(db, { ...finding(pullRequestIds[0]!), newScreenshots });
    return saved!;
  }

  it('saves screenshots with a new finding and reads them back', () => {
    const saved = withScreenshots(webp(1), webp(2));

    expect(saved.screenshotIds).toHaveLength(2);
    expect(getFindingScreenshot(db, saved.screenshotIds[1]!)).toBe(webp(2));
  });

  it('keeps only the listed screenshots on an update and adds new ones', () => {
    const saved = withScreenshots(webp(1), webp(2));
    const [first, second] = saved.screenshotIds as [number, number];

    const [updated] = updateReviewFinding(db, {
      ...finding(pullRequestIds[0]!),
      id: saved.id,
      screenshotIds: [second],
      newScreenshots: [webp(3)],
    });

    expect(updated!.screenshotIds).toHaveLength(2);
    expect(updated!.screenshotIds[0]).toBe(second);
    expect(getFindingScreenshot(db, first)).toBeNull();
  });

  it('rejects bytes that are not WebP and saves nothing', () => {
    const fake = `data:image/webp;base64,${Buffer.from('<svg></svg>').toString('base64')}`;

    expect(() => withScreenshots(fake)).toThrow('not a WebP');
    expect(listReviewFindings(db, pullRequestIds[0]!)).toEqual([]);
  });

  it('limits a finding to five screenshots', () => {
    const saved = withScreenshots(webp(1), webp(2), webp(3), webp(4), webp(5));

    expect(() =>
      updateReviewFinding(db, {
        ...finding(pullRequestIds[0]!),
        id: saved.id,
        screenshotIds: saved.screenshotIds,
        newScreenshots: [webp(6)],
      }),
    ).toThrow('5 screenshots');
    expect(listReviewFindings(db, pullRequestIds[0]!)[0]!.screenshotIds).toEqual(
      saved.screenshotIds,
    );
  });

  it('deletes screenshots with their finding', () => {
    const saved = withScreenshots(webp(1));

    deleteReviewFinding(db, pullRequestIds[0]!, saved.id);

    expect(getFindingScreenshot(db, saved.screenshotIds[0]!)).toBeNull();
  });
});
