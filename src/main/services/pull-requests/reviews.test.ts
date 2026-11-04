import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { GitHubApiError } from '../../providers/github/client.ts';
import type { GitProvider, ProviderChangedFile } from '../../providers/types.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { createReviewDraft, listReviewDrafts } from './drafts.ts';
import { createReviewFinding, listReviewFindings } from './findings.ts';
import { PullRequestReviews } from './reviews.ts';
import { syncReviewRounds } from './rounds.ts';

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

// The id PReview hides at the end of every review it sends.
const MARKER = /\n\n<!-- preview-submission:([0-9a-f-]{36}) -->$/;
const withoutMarker = (body: string | undefined) => body?.replace(MARKER, '');

function setup() {
  const submitReview = vi.fn<GitProvider['submitReview']>().mockResolvedValue({ id: 'R1' });
  const getReviews = vi.fn<GitProvider['getReviews']>().mockResolvedValue([]);
  const getPullRequestRefs = vi
    .fn<GitProvider['getPullRequestRefs']>()
    .mockResolvedValue({ headSha: HEAD, baseBranch: 'main' });
  const mergePullRequest = vi.fn<GitProvider['mergePullRequest']>().mockResolvedValue(undefined);
  const deleteBranch = vi.fn<GitProvider['deleteBranch']>().mockResolvedValue(undefined);
  const getReviewThreads = vi.fn<GitProvider['getReviewThreads']>().mockResolvedValue([]);
  const replyToThread = vi.fn<GitProvider['replyToThread']>().mockResolvedValue(undefined);
  const setThreadResolved = vi.fn<GitProvider['setThreadResolved']>().mockResolvedValue(undefined);
  const getChangesBetween = vi.fn<GitProvider['getChangesBetween']>().mockResolvedValue([]);
  const notify = vi.fn();
  const provider = {
    getPullRequests: vi.fn(),
    getPullRequestRefs,
    getPullRequestFiles: vi.fn(),
    getPullRequestCommits: vi.fn(),
    getCommitChanges: vi.fn(),
    getChangesBetween,
    getRepositoryFiles: vi.fn<GitProvider['getRepositoryFiles']>(),
    getMergeBase: vi.fn(),
    getFileContent: vi.fn(),
    getFileBytes: vi.fn(),
    getReviewThreads,
    replyToThread,
    setThreadResolved,
    submitReview,
    getReviews,
    getPullRequestDetails: vi.fn(),
    getChecks: vi.fn(),
    mergePullRequest,
    deleteBranch,
  } satisfies GitProvider;
  return {
    getReviews,
    getPullRequestRefs,
    getChangesBetween,
    getReviewThreads,
    replyToThread,
    setThreadResolved,
    submitReview,
    mergePullRequest,
    deleteBranch,
    notify,
    reviews: new PullRequestReviews({ db, provider, notify, log: { warn: () => {} } }),
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
        findingIds: [],
        verdict: 'approve',
        body: '  Looks good.  ',
      }),
    ).resolves.toEqual({ status: 'submitted' });

    const [repository, number, review] = submitReview.mock.calls[0]!;
    expect([repository, number]).toEqual(['octo/app', 7]);
    expect(review.body).toMatch(MARKER);
    expect({ ...review, body: withoutMarker(review.body) }).toEqual({
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
        findingIds: [],
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
          findingIds: [],
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
        findingIds: [],
        verdict: 'approve',
        body: '',
      }),
    ).resolves.toEqual({ status: 'rejected', message: 'Can not approve your own pull request' });
  });

  it('queues the review when GitHub cannot be reached', async () => {
    const { submitReview, reviews } = setup();
    submitReview.mockRejectedValue(new Error('offline'));

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        findingIds: [],
        verdict: 'approve',
        body: '',
      }),
    ).resolves.toEqual({ status: 'queued' });
  });

  it('rejects an unknown pull request', async () => {
    const { reviews } = setup();

    await expect(
      reviews.submit({
        pullRequestId: 999,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        findingIds: [],
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
        findingIds: [],
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

  it('ends the round when GitHub takes the review, and not when it refuses it', async () => {
    const { submitReview, reviews } = setup();
    syncReviewRounds(db, pullRequestId, HEAD);
    const input = {
      pullRequestId,
      headSha: HEAD,
      mergeBase: BASE,
      draftIds: [],
      findingIds: [],
      verdict: 'comment' as const,
      body: 'Notes.',
    };

    submitReview.mockRejectedValueOnce(new GitHubApiError(422, '/reviews', 'No.'));
    await reviews.submit(input);
    expect(syncReviewRounds(db, pullRequestId, HEAD)[0]?.submittedAt).toBeNull();

    await reviews.submit(input);
    expect(syncReviewRounds(db, pullRequestId, HEAD)[0]?.submittedAt).not.toBeNull();
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
        findingIds: [],
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
        findingIds: [],
        verdict: 'comment',
        body: 'Notes.',
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    expect(submitReview).not.toHaveBeenCalled();
  });

  it('adds findings to the body and marks them published once GitHub has them', async () => {
    const { submitReview, reviews } = setup();
    createReviewFinding(db, {
      pullRequestId,
      category: 'ui-bug',
      description: 'The save button overlaps the footer.',
      steps: '1. Open settings.\n2. Shrink the window.',
    });
    const [first, second] = createReviewFinding(db, {
      pullRequestId,
      category: 'security',
      description: 'The token is logged.',
      steps: '',
    });

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        findingIds: [first!.id, second!.id],
        verdict: 'comment',
        body: '',
      }),
    ).resolves.toEqual({ status: 'submitted' });

    expect(withoutMarker(submitReview.mock.calls[0]?.[2].body)).toBe(
      [
        '## Findings',
        '### 1. UI bug',
        'The save button overlaps the footer.',
        '**Steps to reproduce**',
        '1. Open settings.\n2. Shrink the window.',
        '### 2. Security',
        'The token is logged.',
      ].join('\n\n'),
    );
    expect(listReviewFindings(db, pullRequestId).every((f) => f.publishedAt !== null)).toBe(true);
  });

  it('puts the summary before the findings', async () => {
    const { submitReview, reviews } = setup();
    const [finding] = createReviewFinding(db, {
      pullRequestId,
      category: 'bug',
      description: 'Crashes on empty input.',
      steps: '',
    });

    await reviews.submit({
      pullRequestId,
      headSha: HEAD,
      mergeBase: BASE,
      draftIds: [],
      findingIds: [finding!.id],
      verdict: 'approve',
      body: ' Nice work. ',
    });

    expect(withoutMarker(submitReview.mock.calls[0]?.[2].body)).toBe(
      'Nice work.\n\n## Findings\n\n### 1. Bug\n\nCrashes on empty input.',
    );
  });

  it('keeps findings unpublished when GitHub refuses the review', async () => {
    const { submitReview, reviews } = setup();
    submitReview.mockRejectedValue(new GitHubApiError(422, '/reviews', 'Body is too long'));
    const [finding] = createReviewFinding(db, {
      pullRequestId,
      category: 'bug',
      description: 'Crashes.',
      steps: '',
    });

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        findingIds: [finding!.id],
        verdict: 'comment',
        body: '',
      }),
    ).resolves.toEqual({ status: 'rejected', message: 'Body is too long' });
    expect(listReviewFindings(db, pullRequestId)[0]?.publishedAt).toBeNull();
  });

  it('refuses findings that were already published', async () => {
    const { submitReview, reviews } = setup();
    const [finding] = createReviewFinding(db, {
      pullRequestId,
      category: 'bug',
      description: 'Crashes.',
      steps: '',
    });
    db.prepare("UPDATE review_findings SET published_at = 'then'").run();

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: HEAD,
        mergeBase: BASE,
        draftIds: [],
        findingIds: [finding!.id],
        verdict: 'comment',
        body: 'Notes.',
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    expect(submitReview).not.toHaveBeenCalled();
  });
});

describe('PullRequestReviews durable submissions', () => {
  const draft = () =>
    createReviewDraft(db, {
      pullRequestId,
      headSha: HEAD,
      mergeBase: BASE,
      path: 'src/app.ts',
      side: 'modified',
      startLine: null,
      line: 3,
      body: 'Fix this.',
    }).at(-1)!;
  const input = (draftIds: number[], sendToAgent = false) => ({
    pullRequestId,
    headSha: HEAD,
    mergeBase: BASE,
    draftIds,
    findingIds: [],
    verdict: 'comment' as const,
    body: 'Notes.',
    sendToAgent,
  });
  const submissions = () =>
    db.prepare('SELECT state, provider_review_id FROM review_submissions').all();
  const tasks = () => db.prepare('SELECT submission_id, status FROM agent_tasks').all();
  const postedBody = (submitReview: ReturnType<typeof setup>['submitReview']) =>
    submitReview.mock.calls[0]![2].body;

  it('keeps the review and its drafts when GitHub cannot be reached', async () => {
    const { submitReview, reviews } = setup();
    const comment = draft();
    submitReview.mockRejectedValueOnce(new Error('offline'));

    await expect(reviews.submit(input([comment.id]))).resolves.toEqual({ status: 'queued' });

    expect(submissions()).toEqual([{ state: 'publishing', provider_review_id: null }]);
    expect(listReviewDrafts(db, pullRequestId)).toHaveLength(1);
  });

  it('does not post again when GitHub turns out to have the review', async () => {
    const { submitReview, getReviews, reviews } = setup();
    const comment = draft();
    submitReview.mockRejectedValueOnce(new Error('offline'));
    await expect(reviews.submit(input([comment.id]))).resolves.toEqual({ status: 'queued' });
    getReviews.mockResolvedValue([{ id: 'R9', body: postedBody(submitReview) }]);

    await expect(reviews.submit(input([comment.id]))).resolves.toEqual({ status: 'submitted' });

    expect(submitReview).toHaveBeenCalledTimes(1);
    expect(submissions()).toEqual([{ state: 'published', provider_review_id: 'R9' }]);
    expect(listReviewDrafts(db, pullRequestId)).toEqual([]);
  });

  it('marks a review failed when GitHub never got it, and sends the retry', async () => {
    const { submitReview, reviews } = setup();
    const comment = draft();
    submitReview.mockRejectedValueOnce(new Error('offline'));
    await expect(reviews.submit(input([comment.id]))).resolves.toEqual({ status: 'queued' });

    await expect(reviews.submit(input([comment.id]))).resolves.toEqual({ status: 'submitted' });

    expect(submitReview).toHaveBeenCalledTimes(2);
    expect(submissions()).toEqual([
      { state: 'failed', provider_review_id: null },
      { state: 'published', provider_review_id: 'R1' },
    ]);
    expect(listReviewDrafts(db, pullRequestId)).toEqual([]);
  });

  it('refuses a second submit while one is being sent', async () => {
    const { submitReview, reviews } = setup();
    let finish: (value: { id: string }) => void = () => {};
    submitReview.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const first = reviews.submit(input([]));

    await expect(reviews.submit(input([]))).resolves.toEqual({
      status: 'rejected',
      message: 'This review is already being sent.',
    });
    finish({ id: 'R1' });
    await expect(first).resolves.toEqual({ status: 'submitted' });
  });

  it('forgets a review GitHub refuses', async () => {
    const { submitReview, reviews } = setup();
    submitReview.mockRejectedValueOnce(new GitHubApiError(422, 'POST', 'Unprocessable'));

    await reviews.submit(input([]));

    expect(submissions()).toEqual([]);
  });

  it('confirms a queued review GitHub already has', async () => {
    const { submitReview, getReviews, reviews } = setup();
    const comment = draft();
    submitReview.mockRejectedValueOnce(new Error('offline'));
    await expect(reviews.submit(input([comment.id]))).resolves.toEqual({ status: 'queued' });
    getReviews.mockResolvedValue([{ id: 'R9', body: postedBody(submitReview) }]);

    await reviews.sendQueued();

    expect(submissions()).toEqual([{ state: 'published', provider_review_id: 'R9' }]);
    expect(listReviewDrafts(db, pullRequestId)).toEqual([]);
  });

  it('sends a queued review once GitHub can be reached', async () => {
    const { submitReview, notify, reviews } = setup();
    const comment = draft();
    submitReview.mockRejectedValueOnce(new Error('offline'));
    await reviews.submit(input([comment.id]));
    expect(reviews.getQueued(pullRequestId)).not.toBeNull();

    await reviews.sendQueued();

    expect(submitReview).toHaveBeenCalledTimes(2);
    expect(postedBody(submitReview)).toBe(submitReview.mock.calls[1]![2].body);
    expect(submitReview.mock.calls[1]![2].comments).toEqual(
      submitReview.mock.calls[0]![2].comments,
    );
    expect(submissions()).toEqual([{ state: 'published', provider_review_id: 'R1' }]);
    expect(listReviewDrafts(db, pullRequestId)).toEqual([]);
    expect(reviews.getQueued(pullRequestId)).toBeNull();
    expect(notify).toHaveBeenCalledWith('Review sent', 'PReview sent your queued review of #7.');
  });

  it('keeps a review queued while GitHub still cannot be reached', async () => {
    const { submitReview, getReviews, reviews } = setup();
    submitReview.mockRejectedValueOnce(new Error('offline'));
    await reviews.submit(input([draft().id]));
    getReviews.mockRejectedValueOnce(new Error('offline'));

    await reviews.sendQueued();

    expect(submitReview).toHaveBeenCalledTimes(1);
    expect(submissions()).toEqual([{ state: 'publishing', provider_review_id: null }]);
  });

  it('drops a queued review when the branch moved, and keeps its drafts', async () => {
    const { submitReview, getPullRequestRefs, notify, reviews } = setup();
    submitReview.mockRejectedValueOnce(new Error('offline'));
    await reviews.submit(input([draft().id]));
    getPullRequestRefs.mockResolvedValue({ headSha: 'c'.repeat(40), baseBranch: 'main' });

    await reviews.sendQueued();

    expect(submitReview).toHaveBeenCalledTimes(1);
    expect(submissions()).toEqual([{ state: 'failed', provider_review_id: null }]);
    expect(listReviewDrafts(db, pullRequestId)).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith(
      'Your review of #7 wasn’t sent',
      'The branch has new commits since you wrote it. Its comments are still in your drafts.',
    );
  });

  it('drops a queued review when one of its drafts was edited', async () => {
    const { submitReview, reviews } = setup();
    const comment = draft();
    submitReview.mockRejectedValueOnce(new Error('offline'));
    await reviews.submit(input([comment.id]));
    db.prepare("UPDATE review_drafts SET body = 'Changed.' WHERE id = ?").run(comment.id);

    await reviews.sendQueued();

    expect(submitReview).toHaveBeenCalledTimes(1);
    expect(submissions()).toEqual([{ state: 'failed', provider_review_id: null }]);
  });

  it('drops a queued review GitHub refuses', async () => {
    const { submitReview, notify, reviews } = setup();
    submitReview.mockRejectedValueOnce(new Error('offline'));
    await reviews.submit(input([draft().id]));
    submitReview.mockRejectedValueOnce(new GitHubApiError(422, 'POST', 'Unprocessable'));

    await reviews.sendQueued();

    expect(submissions()).toEqual([{ state: 'failed', provider_review_id: null }]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('queues one agent task for a review sent to the agent', async () => {
    const { reviews } = setup();
    const comment = draft();

    await expect(reviews.submit(input([comment.id], true))).resolves.toEqual({
      status: 'submitted',
    });

    const { id } = db.prepare('SELECT id FROM review_submissions').get() as { id: string };
    expect(tasks()).toEqual([{ submission_id: id, status: 'queued' }]);
  });

  it('queues the agent task when a review sent to the agent is confirmed later', async () => {
    const { submitReview, getReviews, reviews } = setup();
    const comment = draft();
    submitReview.mockRejectedValueOnce(new Error('offline'));
    await expect(reviews.submit(input([comment.id], true))).resolves.toEqual({
      status: 'queued',
    });
    expect(tasks()).toEqual([]);
    getReviews.mockResolvedValue([{ id: 'R9', body: postedBody(submitReview) }]);

    await reviews.sendQueued();

    expect(tasks()).toHaveLength(1);
  });

  it('refuses to send to the agent when the branch moved', async () => {
    const { submitReview, getPullRequestRefs, reviews } = setup();
    const comment = draft();
    getPullRequestRefs.mockResolvedValue({ headSha: 'c'.repeat(40), baseBranch: 'main' });

    await expect(reviews.submit(input([comment.id], true))).resolves.toEqual({
      status: 'rejected',
      message: 'The branch has new commits since you reviewed it. Reload and review them first.',
    });
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

  it('explains a 404 as an account without write access', async () => {
    const { mergePullRequest, reviews } = setup();
    mergePullRequest.mockRejectedValue(new GitHubApiError(404, '/merge', 'Not Found'));

    await expect(reviews.merge({ pullRequestId, headSha: HEAD, method: 'merge' })).resolves.toEqual(
      {
        status: 'rejected',
        message:
          'Your GitHub account can’t merge in this repository. Check that it has write access.',
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

describe('PullRequestReviews thread changes', () => {
  it('posts a trimmed reply', async () => {
    const { replyToThread, reviews } = setup();

    await expect(
      reviews.reply({ pullRequestId, threadId: 'T1', body: ' Fixed. ' }),
    ).resolves.toEqual({ status: 'saved' });
    expect(replyToThread).toHaveBeenCalledWith('octo/app', 'T1', 'Fixed.');
  });

  it.each([true, false])('sets resolved to %s', async (resolved) => {
    const { setThreadResolved, reviews } = setup();

    await expect(
      reviews.setThreadResolved({ pullRequestId, threadId: 'T1', resolved }),
    ).resolves.toEqual({ status: 'saved' });
    expect(setThreadResolved).toHaveBeenCalledWith('octo/app', 'T1', resolved);
  });

  it("passes on GitHub's reason when it refuses", async () => {
    const { setThreadResolved, reviews } = setup();
    setThreadResolved.mockRejectedValue(
      new GitHubApiError(200, '/graphql', 'Resource not accessible by integration'),
    );

    await expect(
      reviews.setThreadResolved({ pullRequestId, threadId: 'T1', resolved: true }),
    ).resolves.toEqual({
      status: 'rejected',
      message: 'Resource not accessible by integration',
    });
  });

  it('throws when GitHub cannot be reached', async () => {
    const { replyToThread, reviews } = setup();
    replyToThread.mockRejectedValue(new GitHubApiError(502, '/graphql'));

    await expect(
      reviews.reply({ pullRequestId, threadId: 'T1', body: 'Fixed.' }),
    ).rejects.toThrow();
  });
});

describe('PullRequestReviews reattachDrafts', () => {
  const NEW_HEAD = 'c'.repeat(40);
  const NEW_BASE = 'd'.repeat(40);
  const changed = (path: string, hunks: ProviderChangedFile['hunks']): ProviderChangedFile => ({
    path,
    blobSha: 'sha',
    previousPath: null,
    status: 'modified',
    additions: 1,
    deletions: 1,
    hunks,
  });

  function draftOn(
    path: string,
    line: number,
    overrides: { side?: 'original' | 'modified'; mergeBase?: string; startLine?: number } = {},
  ) {
    const drafts = createReviewDraft(db, {
      pullRequestId,
      headSha: HEAD,
      mergeBase: overrides.mergeBase ?? BASE,
      path,
      side: overrides.side ?? 'modified',
      startLine: overrides.startLine ?? null,
      line,
      body: 'Check.',
    });
    return drafts.at(-1)!;
  }

  const move = (reviews: PullRequestReviews, mergeBase = BASE) =>
    reviews.reattachDrafts({ pullRequestId, headSha: NEW_HEAD, mergeBase });

  it('moves drafts in files the new commits left alone, and shifts the ones below a change', async () => {
    const { getChangesBetween, reviews } = setup();
    getChangesBetween.mockResolvedValue([
      changed('b.ts', [{ originalStart: 1, originalCount: 5, modifiedStart: 1, modifiedCount: 8 }]),
    ]);
    draftOn('a.ts', 12);
    draftOn('b.ts', 40, { startLine: 38 });

    const drafts = await move(reviews);

    expect(
      drafts.map(({ path, startLine, line, outdated, headSha }) => ({
        path,
        startLine,
        line,
        outdated,
        headSha,
      })),
    ).toEqual([
      { path: 'a.ts', startLine: null, line: 12, outdated: false, headSha: NEW_HEAD },
      { path: 'b.ts', startLine: 41, line: 43, outdated: false, headSha: NEW_HEAD },
    ]);
    expect(getChangesBetween).toHaveBeenCalledTimes(1);
    expect(getChangesBetween).toHaveBeenCalledWith('octo/app', HEAD, NEW_HEAD);
  });

  it('marks a draft outdated when a change touches its lines, and keeps it where it was', async () => {
    const { getChangesBetween, reviews } = setup();
    getChangesBetween.mockResolvedValue([
      changed('a.ts', [
        { originalStart: 10, originalCount: 6, modifiedStart: 10, modifiedCount: 2 },
      ]),
    ]);
    draftOn('a.ts', 12);

    const [draft] = await move(reviews);

    expect(draft).toMatchObject({ line: 12, outdated: true, headSha: NEW_HEAD });
  });

  it('marks a draft outdated when its file was renamed, removed or has no diff', async () => {
    const { getChangesBetween, reviews } = setup();
    getChangesBetween.mockResolvedValue([
      { ...changed('new.ts', null), previousPath: 'renamed.ts', status: 'renamed' },
      { ...changed('removed.ts', null), status: 'removed' },
      changed('big.ts', null),
    ]);
    draftOn('renamed.ts', 3);
    draftOn('removed.ts', 3);
    draftOn('big.ts', 3);

    const drafts = await move(reviews);

    expect(drafts.map((draft) => draft.outdated)).toEqual([true, true, true]);
  });

  it('marks drafts outdated when the base moved, but keeps old-side drafts when it did not', async () => {
    const { getChangesBetween, reviews } = setup();
    draftOn('a.ts', 5, { side: 'original' });
    expect((await move(reviews))[0]).toMatchObject({ line: 5, outdated: false });
    expect(getChangesBetween).not.toHaveBeenCalled();

    const [rebased] = await reviews.reattachDrafts({
      pullRequestId,
      headSha: 'e'.repeat(40),
      mergeBase: NEW_BASE,
    });
    expect(rebased).toMatchObject({ outdated: true, mergeBase: NEW_BASE });
  });

  it('marks drafts outdated when GitHub no longer has the commit they were written on', async () => {
    const { getChangesBetween, reviews } = setup();
    getChangesBetween.mockRejectedValue(new GitHubApiError(404, '/compare', 'Not Found'));
    draftOn('a.ts', 5);

    expect((await move(reviews))[0]).toMatchObject({ outdated: true });
  });

  it('marks drafts outdated when the comparison may be cut short', async () => {
    const { getChangesBetween, reviews } = setup();
    getChangesBetween.mockResolvedValue(
      Array.from({ length: 300 }, (_, index) => changed(`f${index}.ts`, [])),
    );
    draftOn('a.ts', 5);

    expect((await move(reviews))[0]).toMatchObject({ outdated: true });
  });

  it('throws when GitHub cannot be reached and leaves the drafts as they were', async () => {
    const { getChangesBetween, reviews } = setup();
    getChangesBetween.mockRejectedValue(new GitHubApiError(500, '/compare', 'Down'));
    draftOn('a.ts', 5);

    await expect(move(reviews)).rejects.toThrow();
    expect(listReviewDrafts(db, pullRequestId)[0]).toMatchObject({
      headSha: HEAD,
      outdated: false,
    });
  });

  it('keeps an outdated draft with the commits on show and never sends it', async () => {
    const { getChangesBetween, submitReview, reviews } = setup();
    getChangesBetween.mockResolvedValue([
      changed('a.ts', [{ originalStart: 4, originalCount: 3, modifiedStart: 4, modifiedCount: 3 }]),
    ]);
    const draft = draftOn('a.ts', 5);
    await move(reviews);
    expect(await move(reviews)).toHaveLength(1);

    await expect(
      reviews.submit({
        pullRequestId,
        headSha: NEW_HEAD,
        mergeBase: BASE,
        draftIds: [draft.id],
        findingIds: [],
        verdict: 'comment',
        body: 'Notes.',
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    expect(submitReview).not.toHaveBeenCalled();
  });
});
