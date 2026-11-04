import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { listXpTransactions, validateReport } from '../progression/xp.ts';
import type { ReviewThread } from '../../../shared/contracts/pull-request-reviews.ts';
import { recordSentComments, syncCommentResolutions } from './comments.ts';
import { createReviewDraft, listReviewDrafts, updateReviewDraft } from './drafts.ts';

let db: ReturnType<typeof openDatabase>;
let pullRequestId: number;

const sha = 'a'.repeat(40);

function draft(body: string, category: 'bug' | 'security' | null) {
  createReviewDraft(db, {
    pullRequestId,
    headSha: sha,
    mergeBase: sha,
    path: 'src/app.ts',
    side: 'modified',
    startLine: null,
    line: 3,
    body,
    category,
  });
}

// Sends every draft in one submission with an agent task, as the review service does.
function send(): number {
  const drafts = listReviewDrafts(db, pullRequestId);
  db.prepare(
    `INSERT INTO review_submissions
       (id, pull_request_id, head_sha, verdict, body, comments, draft_ids, finding_ids,
        send_to_agent)
     VALUES ('s1', ?, ?, 'comment', '', ?, ?, '[]', 1)`,
  ).run(
    pullRequestId,
    sha,
    JSON.stringify(
      drafts.map((item) => ({
        path: item.path,
        side: item.side,
        startLine: item.startLine,
        line: item.line,
        body: item.body,
      })),
    ),
    JSON.stringify(drafts.map((item) => item.id)),
  );
  recordSentComments(db, 's1');
  db.prepare("INSERT INTO agent_tasks (submission_id, pull_request_id) VALUES ('s1', ?)").run(
    pullRequestId,
  );
  return (db.prepare('SELECT id FROM agent_tasks').get() as { id: number }).id;
}

const thread = (body: string, resolved: boolean): ReviewThread => ({
  id: body,
  path: 'src/app.ts',
  side: 'modified',
  startLine: null,
  line: 9,
  resolved,
  outdated: false,
  comments: [{ id: 'c', author: null, body, createdAt: '', url: '' }],
});

const fixed = (...ids: string[]) => ({
  items: ids.map((id) => ({ id, outcome: 'fixed' as const, note: '' })),
  tests: [],
  summary: '',
});

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  reconcileRepositories(db, [
    { path: '/code/app', name: 'app', remoteUrl: 'git@github.com:octo/app.git', rootCommit: 'r' },
  ]);
  const repository = db.prepare('SELECT id FROM repositories').get() as { id: number };
  db.prepare(
    `INSERT INTO pull_requests
       (repository_id, provider_id, number, title, draft, url, head_branch, head_sha, base_branch,
        created_at, updated_at)
     VALUES (?, '10', 7, 'Title', 0, 'https://example.test', 'feature', 'headsha', 'main', 'a', 'b')`,
  ).run(repository.id);
  pullRequestId = (db.prepare('SELECT id FROM pull_requests').get() as { id: number }).id;
});

describe('draft categories', () => {
  it('keeps the category unless an update gives one', () => {
    draft('Off by one', 'bug');
    const [saved] = listReviewDrafts(db, pullRequestId);
    expect(saved?.category).toBe('bug');
    updateReviewDraft(db, { pullRequestId, id: saved!.id, body: 'Off by two' });
    expect(listReviewDrafts(db, pullRequestId)[0]?.category).toBe('bug');
    updateReviewDraft(db, { pullRequestId, id: saved!.id, body: 'Off by two', category: null });
    expect(listReviewDrafts(db, pullRequestId)[0]?.category).toBeNull();
  });
});

describe('comment XP', () => {
  it('needs the agent to fix it and its thread to be resolved', () => {
    draft('Off by one', 'bug');
    draft('Leaks the token', 'security');
    const taskId = send();
    syncCommentResolutions(db, pullRequestId, [thread('Off by one', true)]);
    expect(listXpTransactions(db, pullRequestId)).toEqual([]);
    validateReport(db, taskId, fixed('C1', 'C2'));
    expect(listXpTransactions(db, pullRequestId)).toMatchObject([
      { reason: 'comment-resolved', amount: 50 },
    ]);
    syncCommentResolutions(db, pullRequestId, [
      thread('Off by one', true),
      thread('Leaks the token', true),
    ]);
    expect(listXpTransactions(db, pullRequestId).map((xp) => xp.amount)).toEqual([50, 100]);
  });

  it('earns nothing without a category', () => {
    draft('Rename this', null);
    validateReport(db, send(), fixed('C1'));
    syncCommentResolutions(db, pullRequestId, [thread('Rename this', true)]);
    expect(listXpTransactions(db, pullRequestId)).toEqual([]);
  });

  it('keeps XP when the thread is reopened', () => {
    draft('Off by one', 'bug');
    validateReport(db, send(), fixed('C1'));
    syncCommentResolutions(db, pullRequestId, [thread('Off by one', true)]);
    syncCommentResolutions(db, pullRequestId, [thread('Off by one', false)]);
    syncCommentResolutions(db, pullRequestId, [thread('Off by one', true)]);
    expect(listXpTransactions(db, pullRequestId).map((xp) => xp.amount)).toEqual([50]);
    expect(db.prepare('SELECT resolution FROM review_comments').get()).toEqual({
      resolution: 'resolved',
    });
  });
});
