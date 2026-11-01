import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import type { GitProvider } from '../../providers/types.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { MAX_FILE_LENGTH, MAX_IMAGE_BYTES, PullRequestFiles } from './files.ts';

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

function setup(contents: Record<string, string | undefined> = {}) {
  const provider = {
    getRepositories: vi.fn(),
    getPullRequests: vi.fn(),
    getPullRequestRefs: vi
      .fn<GitProvider['getPullRequestRefs']>()
      .mockResolvedValue({ headSha: HEAD, baseBranch: 'main' }),
    getPullRequestFiles: vi.fn<GitProvider['getPullRequestFiles']>().mockResolvedValue([]),
    getMergeBase: vi.fn<GitProvider['getMergeBase']>().mockResolvedValue(BASE),
    getFileContent: vi.fn<GitProvider['getFileContent']>((_repository, path, ref) =>
      Promise.resolve(contents[`${ref}:${path}`]),
    ),
    getFileBytes: vi.fn<GitProvider['getFileBytes']>().mockResolvedValue(undefined),
    submitReview: vi.fn<GitProvider['submitReview']>(),
  } satisfies GitProvider;
  return { provider, files: new PullRequestFiles({ db, provider }) };
}

const file = {
  path: 'a.ts',
  previousPath: null,
  status: 'added',
  additions: 1,
  deletions: 0,
} as const;

describe('PullRequestFiles list', () => {
  it('returns the files with the commits they are at', async () => {
    const { provider, files } = setup();
    provider.getPullRequestFiles.mockResolvedValue([file]);

    await expect(files.list(pullRequestId)).resolves.toEqual({
      headSha: HEAD,
      mergeBase: BASE,
      files: [file],
    });
    expect(provider.getPullRequestFiles).toHaveBeenCalledWith('octo/app', 7);
    expect(provider.getMergeBase).toHaveBeenCalledWith('octo/app', 'main', HEAD);
  });

  it('uses the base branch the pull request has now, not the synced one', async () => {
    const { provider, files } = setup();
    provider.getPullRequestRefs.mockResolvedValue({ headSha: HEAD, baseBranch: 'release/1' });

    await files.list(pullRequestId);

    expect(provider.getMergeBase).toHaveBeenCalledWith('octo/app', 'release/1', HEAD);
  });

  it('reads again when the pull request changes during the reads', async () => {
    const { provider, files } = setup();
    const moved = 'c'.repeat(40);
    provider.getPullRequestRefs
      .mockResolvedValueOnce({ headSha: HEAD, baseBranch: 'main' })
      .mockResolvedValueOnce({ headSha: moved, baseBranch: 'main' })
      .mockResolvedValue({ headSha: moved, baseBranch: 'main' });

    await expect(files.list(pullRequestId)).resolves.toMatchObject({ headSha: moved });
    expect(provider.getPullRequestFiles).toHaveBeenCalledTimes(2);
  });

  it('gives up when the pull request keeps changing', async () => {
    const { provider, files } = setup();
    let count = 0;
    provider.getPullRequestRefs.mockImplementation(() =>
      Promise.resolve({ headSha: String(count++).padStart(40, '0'), baseBranch: 'main' }),
    );

    await expect(files.list(pullRequestId)).rejects.toThrow('kept changing');
  });

  it('rejects an unknown pull request', async () => {
    const { files } = setup();

    await expect(files.list(999)).rejects.toThrow('Pull request not found.');
  });
});

describe('PullRequestFiles getDiff', () => {
  it('reads the file at the merge base and at the head commit it is given', async () => {
    const { provider, files } = setup({ [`${BASE}:a.ts`]: 'old', [`${HEAD}:a.ts`]: 'new' });

    await expect(files.getDiff(pullRequestId, HEAD, BASE, 'a.ts', null)).resolves.toEqual({
      original: 'old',
      modified: 'new',
      unavailable: null,
      images: null,
    });
    expect(provider.getPullRequestRefs).not.toHaveBeenCalled();
  });

  it('reads the old side of a renamed file from its previous path', async () => {
    const { files } = setup({ [`${BASE}:old.ts`]: 'old', [`${HEAD}:new.ts`]: 'new' });

    await expect(
      files.getDiff(pullRequestId, HEAD, BASE, 'new.ts', 'old.ts'),
    ).resolves.toMatchObject({ original: 'old', modified: 'new' });
  });

  it('treats a side that does not exist as empty', async () => {
    const { files } = setup({ [`${HEAD}:a.ts`]: 'new' });

    await expect(files.getDiff(pullRequestId, HEAD, BASE, 'a.ts', null)).resolves.toEqual({
      original: '',
      modified: 'new',
      unavailable: null,
      images: null,
    });
  });

  it('does not return binary files', async () => {
    const { files } = setup({ [`${HEAD}:a.bin`]: 'PNG\0data' });

    await expect(files.getDiff(pullRequestId, HEAD, BASE, 'a.bin', null)).resolves.toEqual({
      original: '',
      modified: '',
      unavailable: 'binary',
      images: null,
    });
  });

  it('does not return files that are too large', async () => {
    const { files } = setup({ [`${HEAD}:big.txt`]: 'x'.repeat(MAX_FILE_LENGTH + 1) });

    await expect(files.getDiff(pullRequestId, HEAD, BASE, 'big.txt', null)).resolves.toMatchObject({
      unavailable: 'too-large',
    });
  });

  it('returns image files as data URLs instead of text', async () => {
    const { provider, files } = setup();
    provider.getFileBytes.mockImplementation((_repository, _path, ref) =>
      Promise.resolve(ref === HEAD ? new Uint8Array([1, 2, 3]) : undefined),
    );

    await expect(files.getDiff(pullRequestId, HEAD, BASE, 'build/icon.png', null)).resolves.toEqual(
      {
        original: '',
        modified: '',
        unavailable: null,
        images: { original: null, modified: 'data:image/png;base64,AQID' },
      },
    );
    expect(provider.getFileContent).not.toHaveBeenCalled();
  });

  it('does not return images that are too large', async () => {
    const { provider, files } = setup();
    provider.getFileBytes.mockResolvedValue(new Uint8Array(MAX_IMAGE_BYTES + 1));

    await expect(files.getDiff(pullRequestId, HEAD, BASE, 'big.png', null)).resolves.toMatchObject({
      unavailable: 'too-large',
      images: null,
    });
  });
});
