import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { GitHubApiError } from '../../providers/github/client.ts';
import type { GitProvider } from '../../providers/types.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { createReviewDraft, listReviewDrafts } from './drafts.ts';
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
const BASE = 'b'.repeat(40);

function setup() {
  const submitReview = vi.fn<GitProvider['submitReview']>().mockResolvedValue(undefined);
  const mergePullRequest = vi.fn<GitProvider['mergePullRequest']>().mockResolvedValue(undefined);
  const deleteBranch = vi.fn<GitProvider['deleteBranch']>().mockResolvedValue(undefined);
  const getReviewThreads = vi.fn<GitProvider['getReviewThreads']>().mockResolvedValue([]);
  const provider = {
    getRepositories: vi.fn(),
    getPullRequests: vi.fn(),
    getPullRequestRefs: vi.fn(),
    getPullRequestFiles: vi.fn(),
    getMergeBase: vi.fn(),
    getFileContent: vi.fn(),
    getFileBytes: vi.fn(),
    getReviewThreads,
    submitReview,
    mergePullRequest,
    deleteBranch,
  } satisfies GitProvider;
  return {
    getReviewThreads,
    submitReview,
    mergePullRequest,
    deleteBranch,
    reviews: new PullRequestReviews({ db, provider }),
  };
}

describe('PullRequestReviews', () => {
  it('submits the review to the pull request in its repository', async () => {
    const { submitReview, reviews } = setup();

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        verdict: 'approve',
        body: '  Looks good.  ',
      }),
    ).resolves.toEqual({ status: 'submitted' });

    expect(submitReview).toHaveBeenCalledWith('octo/app', 7, {
      verdict: 'approve',
      body: 'Looks good.',
      headSha: HEAD,
      comments: [],
    });
  });

  it('allows approving without a summary', async () => {
    const { reviews } = setup();

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        verdict: 'approve',
        body: '',
      }),
    ).resolves.toEqual({ status: 'submitted' });
  });

  it.each(['comment', 'request-changes'] as const)(
    'asks for a summary before sending %s',
    async (verdict) => {
      const { submitReview, reviews } = setup();

      await expect(
        reviews.submit({
          pullRequestId,
          headSha: HEAD,
          mergeBase: BASE,
          draftIds: [],
          verdict,
          body: '   ',
        }),
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
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        verdict: 'approve',
        body: '',
      }),
    ).resolves.toEqual({ status: 'rejected', message: 'Can not approve your own pull request' });
  });

  it('throws when GitHub cannot be reached', async () => {
    const { submitReview, reviews } = setup();
    submitReview.mockRejectedValue(new Error('offline'));

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        verdict: 'approve',
        body: '',
      }),
    ).rejects.toThrow('offline');
  });

  it('rejects an unknown pull request', async () => {
    const { reviews } = setup();

    await expect(
      reviews.submit({
        pullRequestId: 999,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        verdict: 'approve',
        body: '',
      }),
    ).rejects.toThrow('Pull request not found.');
  });

  it('publishes drafts as line comments and deletes them once GitHub has them', async () => {
    const { submitReview, reviews } = setup();
    const draft = (line: number, startLine: number | null, headSha = HEAD) =>
      createReviewDraft(db, {
        pullRequestId,
        headSha,
        mergeBase: BASE,
        path: 'src/app.ts',
        side: 'modified',
        startLine,
        line,
        body: `Line ${line}.`,
      }).at(-1)!;
    const single = draft(3, null);
    const range = draft(9, 7);
    const kept = draft(5, null);
    const otherVersion = draft(4, null, 'c'.repeat(40));

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [single.id, range.id],
        verdict: 'comment',
        body: 'Notes.',
      }),
    ).resolves.toEqual({ status: 'submitted' });

    expect(submitReview.mock.calls[0]?.[2].comments).toEqual([
      { path: 'src/app.ts', side: 'modified', startLine: null, line: 3, body: 'Line 3.' },
      { path: 'src/app.ts', side: 'modified', startLine: 7, line: 9, body: 'Line 9.' },
    ]);
    expect(listReviewDrafts(db, pullRequestId).map((item) => item.id)).toEqual([
      kept.id,
      otherVersion.id,
    ]);
  });

  it('keeps drafts when GitHub refuses the review', async () => {
    const { submitReview, reviews } = setup();
    submitReview.mockRejectedValue(
      new GitHubApiError(422, '/reviews', 'Line must be part of the diff'),
    );
    const [draft] = createReviewDraft(db, {
      pullRequestId,
      headSha: HEAD,
      mergeBase: BASE,
      path: 'src/app.ts',
      side: 'modified',
      startLine: null,
      line: 3,
      body: 'Check.',
    });

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [draft!.id],
        verdict: 'comment',
        body: 'Notes.',
      }),
    ).resolves.toEqual({ status: 'rejected', message: 'Line must be part of the diff' });
    expect(listReviewDrafts(db, pullRequestId)).toHaveLength(1);
  });

  it('refuses drafts written on another version of the diff', async () => {
    const { submitReview, reviews } = setup();
    const [draft] = createReviewDraft(db, {
      pullRequestId,
      headSha: 'c'.repeat(40),
      mergeBase: BASE,
      path: 'src/app.ts',
      side: 'modified',
      startLine: null,
      line: 3,
      body: 'Old.',
    });

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [draft!.id],
        verdict: 'comment',
        body: 'Notes.',
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    expect(submitReview).not.toHaveBeenCalled();
  });
});

describe('PullRequestReviews merge', () => {
  it('merges the pull request at the reviewed commit', async () => {
    const { mergePullRequest, reviews } = setup();

    await expect(
      reviews.merge({ pullRequestId, headSha: HEAD, method: 'squash' }),
    ).resolves.toEqual({ status: 'merged' });
    expect(mergePullRequest).toHaveBeenCalledWith('octo/app', 7, HEAD, 'squash');
  });

  it('says so when the branch moved past the reviewed commit', async () => {
    const { mergePullRequest, reviews } = setup();
    mergePullRequest.mockRejectedValue(
      new GitHubApiError(409, '/merge', 'Head branch was modified.'),
    );

    await expect(reviews.merge({ pullRequestId, headSha: HEAD, method: 'merge' })).resolves.toEqual(
      {
        status: 'rejected',
        message: 'The branch has new commits since you reviewed it. Reload and review them first.',
      },
    );
  });

  it("passes on GitHub's reason when it refuses the merge", async () => {
    const { mergePullRequest, reviews } = setup();
    mergePullRequest.mockRejectedValue(
      new GitHubApiError(405, '/merge', 'Merge commits are not allowed on this repository.'),
    );

    await expect(reviews.merge({ pullRequestId, headSha: HEAD, method: 'merge' })).resolves.toEqual(
      {
        status: 'rejected',
        message: 'Merge commits are not allowed on this repository.',
      },
    );
  });

  it('throws when GitHub cannot be reached', async () => {
    const { mergePullRequest, reviews } = setup();
    mergePullRequest.mockRejectedValue(new GitHubApiError(502, '/merge'));

    await expect(
      reviews.merge({ pullRequestId, headSha: HEAD, method: 'merge' }),
    ).rejects.toThrow();
  });
});

describe('PullRequestReviews deleteBranch', () => {
  it("deletes the pull request's branch", async () => {
    const { deleteBranch, reviews } = setup();

    await expect(reviews.deleteBranch({ pullRequestId })).resolves.toEqual({ status: 'deleted' });
    expect(deleteBranch).toHaveBeenCalledWith('octo/app', 'feature');
  });

  it("passes on GitHub's reason when it refuses", async () => {
    const { deleteBranch, reviews } = setup();
    deleteBranch.mockRejectedValue(
      new GitHubApiError(422, '/git/refs', 'Reference does not exist'),
    );

    await expect(reviews.deleteBranch({ pullRequestId })).resolves.toEqual({
      status: 'rejected',
      message: 'Reference does not exist',
    });
  });

  it('throws when GitHub cannot be reached', async () => {
    const { deleteBranch, reviews } = setup();
    deleteBranch.mockRejectedValue(new GitHubApiError(502, '/git/refs'));

    await expect(reviews.deleteBranch({ pullRequestId })).rejects.toThrow();
  });
});

describe('PullRequestReviews listThreads', () => {
  it("reads the pull request's threads from its repository", async () => {
    const { getReviewThreads, reviews } = setup();

    await expect(reviews.listThreads(pullRequestId)).resolves.toEqual([]);
    expect(getReviewThreads).toHaveBeenCalledWith('octo/app', 7);
  });
});
