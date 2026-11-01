import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { GitHubApiError } from '../../providers/github/client.ts';
import type { GitProvider } from '../../providers/types.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { PullRequestReviews } from './reviews.ts';

let db: ReturnType<typeof openDatabase>;
let pullRequestId: number;

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
  db.prepare(
    `INSERT INTO pull_requests
       (repository_id, provider_id, number, title, draft, url, head_branch, head_sha, base_branch,
        created_at, updated_at)
     VALUES (?, '10', 7, 'Title', 0, 'https://example.test/7', 'feature', 'headsha', 'main', 'a', 'b')`,
  ).run(repository.id);
  pullRequestId = (db.prepare('SELECT id FROM pull_requests').get() as { id: number }).id;
});

const HEAD = 'a'.repeat(40);

function setup() {
  const submitReview = vi.fn<GitProvider['submitReview']>().mockResolvedValue(undefined);
  const provider = {
    getRepositories: vi.fn(),
    getPullRequests: vi.fn(),
    getPullRequestRefs: vi.fn(),
    getPullRequestFiles: vi.fn(),
    getMergeBase: vi.fn(),
    getFileContent: vi.fn(),
    getFileBytes: vi.fn(),
    submitReview,
  } satisfies GitProvider;
  return { submitReview, reviews: new PullRequestReviews({ db, provider }) };
}

describe('PullRequestReviews', () => {
  it('submits the review to the pull request in its repository', async () => {
    const { submitReview, reviews } = setup();

    await expect(
      reviews.submit({ pullRequestId, headSha: HEAD, verdict: 'approve', body: '  Looks good.  ' }),
    ).resolves.toEqual({ status: 'submitted' });

    expect(submitReview).toHaveBeenCalledWith('octo/app', 7, {
      verdict: 'approve',
      body: 'Looks good.',
      headSha: HEAD,
    });
  });

  it('allows approving without a summary', async () => {
    const { reviews } = setup();

    await expect(
      reviews.submit({ pullRequestId, headSha: HEAD, verdict: 'approve', body: '' }),
    ).resolves.toEqual({ status: 'submitted' });
  });

  it.each(['comment', 'request-changes'] as const)(
    'asks for a summary before sending %s',
    async (verdict) => {
      const { submitReview, reviews } = setup();

      await expect(
        reviews.submit({ pullRequestId, headSha: HEAD, verdict, body: '   ' }),
      ).resolves.toEqual({
        status: 'rejected',
        message: 'Write a summary to comment or request changes.',
      });
      expect(submitReview).not.toHaveBeenCalled();
    },
  );

  it("returns GitHub's explanation when it refuses the review", async () => {
    const { submitReview, reviews } = setup();
    submitReview.mockRejectedValue(
      new GitHubApiError(422, '/reviews', 'Can not approve your own pull request'),
    );

    await expect(
      reviews.submit({ pullRequestId, headSha: HEAD, verdict: 'approve', body: '' }),
    ).resolves.toEqual({ status: 'rejected', message: 'Can not approve your own pull request' });
  });

  it('throws when GitHub cannot be reached', async () => {
    const { submitReview, reviews } = setup();
    submitReview.mockRejectedValue(new Error('offline'));

    await expect(
      reviews.submit({ pullRequestId, headSha: HEAD, verdict: 'approve', body: '' }),
    ).rejects.toThrow('offline');
  });

  it('rejects an unknown pull request', async () => {
    const { reviews } = setup();

    await expect(
      reviews.submit({ pullRequestId: 999, headSha: HEAD, verdict: 'approve', body: '' }),
    ).rejects.toThrow('Pull request not found.');
  });
});
