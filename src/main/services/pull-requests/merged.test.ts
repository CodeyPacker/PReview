import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { getMergedPullRequest, saveMergedPullRequest } from './merged.ts';

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

describe('saveMergedPullRequest', () => {
  it('counts the review and keeps it after the pull request is deleted', () => {
    const finding = db.prepare(
      'INSERT INTO review_findings (pull_request_id, category, description, validation) VALUES (?, ?, ?, ?)',
    );
    finding.run(pullRequestId, 'bug', 'a', 'pending');
    finding.run(pullRequestId, 'security', 'b', 'validated');
    finding.run(pullRequestId, 'bug', 'c', 'rejected');
    finding.run(pullRequestId, 'improvement', 'd', 'pending');
    db.prepare(
      `INSERT INTO review_drafts (pull_request_id, head_sha, merge_base, path, side, line, body)
       VALUES (?, 'h', 'm', 'a.ts', 'modified', 1, 'unsent')`,
    ).run(pullRequestId);
    db.prepare(
      `INSERT INTO review_submissions
         (id, pull_request_id, head_sha, verdict, body, comments, draft_ids, finding_ids,
          send_to_agent, state)
       VALUES ('s', ?, 'h', 'comment', '', '[{},{}]', '[]', '[]', 0, 'published')`,
    ).run(pullRequestId);
    db.prepare(
      "INSERT INTO file_review_marks (pull_request_id, path, state, blob_sha) VALUES (?, 'a.ts', 'approved', 'x')",
    ).run(pullRequestId);

    saveMergedPullRequest(db, pullRequestId, 'octo/app');
    db.prepare('DELETE FROM pull_requests').run();

    expect(getMergedPullRequest(db, pullRequestId)).toMatchObject({
      repository: 'octo/app',
      number: 7,
      url: 'https://example.test/7',
      comments: 3,
      suggestions: 1,
      bugsCaught: 2,
      filesReviewed: 1,
    });
  });

  it('has nothing for a pull request that was not merged', () => {
    expect(getMergedPullRequest(db, pullRequestId)).toBeNull();
  });
});
