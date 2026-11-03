import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewThread } from '../../../shared/contracts/pull-request-reviews.ts';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import type { GitProvider } from '../../providers/types.ts';
import { createReviewFinding } from '../pull-requests/findings.ts';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dependencySetup, fileDiff, loadTaskContext, taskPrompt } from './context.ts';

let db: ReturnType<typeof openDatabase>;
let pullRequestId: number;

const files = [
  {
    path: 'src/app.ts',
    previousPath: null,
    status: 'modified' as const,
    additions: 2,
    deletions: 1,
    patch: '@@ -1 +1,2 @@\n-a\n+b\n+c',
  },
  {
    path: 'src/new.ts',
    previousPath: 'src/old.ts',
    status: 'renamed' as const,
    additions: 0,
    deletions: 0,
    patch: null,
  },
];

const thread = (path: string, body: string, extra: Partial<ReviewThread> = {}): ReviewThread => ({
  id: path + body,
  path,
  side: 'modified',
  startLine: null,
  line: 3,
  resolved: false,
  outdated: false,
  comments: [{ id: 'c', author: { login: 'alice', avatarUrl: '' }, body, createdAt: '', url: '' }],
  ...extra,
});

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  const repositoryId = Number(
    db
      .prepare(
        `INSERT INTO repositories (path, name, github_owner, github_name, status)
         VALUES ('/code/app', 'app', 'octo', 'app', 'available')`,
      )
      .run().lastInsertRowid,
  );
  pullRequestId = Number(
    db
      .prepare(
        `INSERT INTO pull_requests
           (repository_id, provider_id, number, title, draft, url, head_branch, head_sha,
            base_branch, created_at, updated_at)
         VALUES (?, '1', 7, 'Add login', 0, 'https://example.test/7', 'feature', 'abc', 'main',
                 'a', 'b')`,
      )
      .run(repositoryId).lastInsertRowid,
  );
});

function addTask(findingIds: number[], result: string | null = null): number {
  const submission = `s-${Math.random()}`;
  db.prepare(
    `INSERT INTO review_submissions
       (id, pull_request_id, head_sha, verdict, body, comments, draft_ids, finding_ids,
        send_to_agent)
     VALUES (?, ?, 'abc', 'comment', 'Please fix these.', ?, '[]', ?, 1)`,
  ).run(
    submission,
    pullRequestId,
    JSON.stringify([
      { path: 'src/app.ts', side: 'modified', startLine: null, line: 3, body: 'Rename this.' },
    ]),
    JSON.stringify(findingIds),
  );
  return Number(
    db
      .prepare('INSERT INTO agent_tasks (submission_id, pull_request_id, result) VALUES (?, ?, ?)')
      .run(submission, pullRequestId, result).lastInsertRowid,
  );
}

describe('loadTaskContext', () => {
  it('collects the review, the open discussions and earlier runs', async () => {
    addTask([], JSON.stringify({ items: [], tests: [], summary: 'Fixed the typo.' }));
    const [finding] = createReviewFinding(db, {
      pullRequestId,
      category: 'bug',
      description: 'Crashes on empty input.',
      steps: 'Submit an empty form.',
    });
    const taskId = addTask([finding!.id]);
    const getPullRequestDetails = vi
      .fn()
      .mockResolvedValue({ description: ' Adds login. ', files });
    const provider = {
      getPullRequestDetails,
      getReviewThreads: vi
        .fn()
        .mockResolvedValue([
          thread('src/app.ts', 'Rename this.'),
          thread('src/db.ts', 'Is this indexed?'),
          thread('src/db.ts', 'Old point.', { resolved: true }),
          thread('src/db.ts', 'Moved code.', { outdated: true }),
        ]),
    } as unknown as GitProvider;

    const context = await loadTaskContext(db, provider, taskId);

    expect(getPullRequestDetails).toHaveBeenCalledWith('octo/app', 7);
    expect(context).toMatchObject({
      repository: 'octo/app',
      number: 7,
      description: 'Adds login.',
      summary: 'Please fix these.',
      findings: [
        { category: 'bug', description: 'Crashes on empty input.', steps: 'Submit an empty form.' },
      ],
      earlierRuns: ['Fixed the typo.'],
    });
    expect(context.threads.map((item) => item.comments[0]!.body)).toEqual(['Is this indexed?']);
  });
});

describe('taskPrompt', () => {
  it('names each item and lists the changed files without their diffs', () => {
    const prompt = taskPrompt({
      repository: 'octo/app',
      number: 7,
      title: 'Add login',
      url: 'https://example.test/7',
      baseBranch: 'main',
      headBranch: 'feature',
      headSha: 'abc',
      description: '',
      files,
      summary: 'Please fix these.',
      comments: [
        { path: 'src/app.ts', side: 'modified', startLine: 2, line: 3, body: 'Rename this.' },
      ],
      findings: [{ category: 'bug', description: 'Crashes.', steps: '' }],
      threads: [],
      earlierRuns: [],
    });

    expect(prompt).toContain('- M src/app.ts +2 -1');
    expect(prompt).toContain('- R src/new.ts (from src/old.ts) +0 -0');
    expect(prompt).toContain('C1. src/app.ts, lines 2-3 of the new version:\nRename this.');
    expect(prompt).toContain('F1. Bug: Crashes.');
    expect(prompt).not.toContain('+b');
    expect(prompt).not.toContain('## Description');
  });
});

describe('fileDiff', () => {
  it("answers with a file's diff, found by its old or new path", () => {
    expect(fileDiff(files, 'src/app.ts')).toBe('src/app.ts\n@@ -1 +1,2 @@\n-a\n+b\n+c');
    expect(fileDiff(files, 'src/old.ts')).toBe(
      'GitHub shows no diff for src/new.ts. Read the file instead.',
    );
    expect(fileDiff(files, 'src/other.ts')).toBe(
      'src/other.ts is not changed by this pull request.',
    );
  });
});

describe('dependencySetup', () => {
  const folder = (...files: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-setup-'));
    for (const file of files) writeFileSync(join(dir, file), '');
    return dir;
  };

  it("names the lockfile's install command when dependencies are missing", () => {
    expect(dependencySetup(folder('package.json', 'pnpm-lock.yaml'))).toContain(
      '`pnpm install --frozen-lockfile`',
    );
    expect(dependencySetup(folder('package.json', 'package-lock.json'))).toContain('`npm ci`');
    expect(dependencySetup(folder('package.json'))).toContain('`npm install`');
  });

  it('asks for nothing when dependencies are installed or there is no package.json', () => {
    const installed = folder('package.json', 'yarn.lock');
    mkdirSync(join(installed, 'node_modules'));
    expect(dependencySetup(installed)).toBeNull();
    expect(dependencySetup(folder('pyproject.toml'))).toBeNull();
  });
});
