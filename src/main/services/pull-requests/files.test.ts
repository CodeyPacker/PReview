import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import type { GitProvider } from '../../providers/types.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { MAX_FILE_LENGTH, PullRequestFiles } from './files.ts';

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

function setup(contents: Record<string, string | undefined> = {}) {
  const provider = {
    getRepositories: vi.fn(),
    getPullRequests: vi.fn(),
    getPullRequestFiles: vi.fn<GitProvider['getPullRequestFiles']>().mockResolvedValue([]),
    getMergeBase: vi.fn<GitProvider['getMergeBase']>().mockResolvedValue('basesha'),
    getFileContent: vi.fn<GitProvider['getFileContent']>((_repository, path, ref) =>
      Promise.resolve(contents[`${ref}:${path}`]),
    ),
  } satisfies GitProvider;
  return { provider, files: new PullRequestFiles({ db, provider }) };
}

describe('PullRequestFiles', () => {
  it('lists the files of the pull request in its repository', async () => {
    const { provider, files } = setup();
    provider.getPullRequestFiles.mockResolvedValue([
      { path: 'a.ts', previousPath: null, status: 'added', additions: 1, deletions: 0 },
    ]);

    await expect(files.list(pullRequestId)).resolves.toHaveLength(1);
    expect(provider.getPullRequestFiles).toHaveBeenCalledWith('octo/app', 7);
  });

  it('reads the file at the merge base and at the head commit', async () => {
    const { provider, files } = setup({ 'basesha:a.ts': 'old', 'headsha:a.ts': 'new' });

    await expect(files.getDiff(pullRequestId, 'a.ts', null)).resolves.toEqual({
      original: 'old',
      modified: 'new',
      unavailable: null,
    });
    expect(provider.getMergeBase).toHaveBeenCalledWith('octo/app', 'main', 'headsha');
  });

  it('reads the old side of a renamed file from its previous path', async () => {
    const { files } = setup({ 'basesha:old.ts': 'old', 'headsha:new.ts': 'new' });

    await expect(files.getDiff(pullRequestId, 'new.ts', 'old.ts')).resolves.toMatchObject({
      original: 'old',
      modified: 'new',
    });
  });

  it('treats a side that does not exist as empty', async () => {
    const { files } = setup({ 'headsha:a.ts': 'new' });

    await expect(files.getDiff(pullRequestId, 'a.ts', null)).resolves.toEqual({
      original: '',
      modified: 'new',
      unavailable: null,
    });
  });

  it('looks up the merge base once per head commit', async () => {
    const { provider, files } = setup();

    await files.getDiff(pullRequestId, 'a.ts', null);
    await files.getDiff(pullRequestId, 'b.ts', null);

    expect(provider.getMergeBase).toHaveBeenCalledTimes(1);
  });

  it('does not return binary files', async () => {
    const { files } = setup({ 'headsha:a.png': 'PNG\0data' });

    await expect(files.getDiff(pullRequestId, 'a.png', null)).resolves.toEqual({
      original: '',
      modified: '',
      unavailable: 'binary',
    });
  });

  it('does not return files that are too large', async () => {
    const { files } = setup({ 'headsha:big.txt': 'x'.repeat(MAX_FILE_LENGTH + 1) });

    await expect(files.getDiff(pullRequestId, 'big.txt', null)).resolves.toMatchObject({
      unavailable: 'too-large',
    });
  });

  it('rejects an unknown pull request', async () => {
    const { files } = setup();

    await expect(files.list(999)).rejects.toThrow('Pull request not found.');
  });
});
