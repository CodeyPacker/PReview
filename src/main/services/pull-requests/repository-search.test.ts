import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositorySearchInputSchema } from '../../../shared/contracts/repository-search.ts';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import type { GitProvider } from '../../providers/types.ts';
import { reconcileRepositories } from '../repositories/registry.ts';
import { MAX_MATCHES, RepositorySearch } from './repository-search.ts';

const HEAD = 'a'.repeat(40);

let db: DatabaseSync;
let pullRequestId: number;

function setup(options: { hasCommit: boolean }) {
  const git = vi.fn(() =>
    options.hasCommit ? Promise.resolve('') : Promise.reject(new Error('Not a valid object name')),
  );
  const grep = vi.fn<(cwd: string, args: string[], max: number) => Promise<string[]>>();
  const provider = {
    getRepositoryFiles: vi.fn<GitProvider['getRepositoryFiles']>(),
    getFileContent: vi.fn<GitProvider['getFileContent']>(),
  };
  const search = new RepositorySearch({
    db,
    provider: provider as unknown as GitProvider,
    git,
    grep,
  });
  return { git, grep, provider, search };
}

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
     VALUES (?, '10', 7, 'Title', 0, 'https://example.test', 'feature', ?, 'main', 'a', 'b')`,
  ).run(repository.id, HEAD);
  pullRequestId = (db.prepare('SELECT id FROM pull_requests').get() as { id: number }).id;
});

describe('RepositorySearch in a local clone', () => {
  it('searches with git when the clone has the commit', async () => {
    const { grep, provider, search } = setup({ hasCommit: true });
    grep.mockResolvedValue([
      `${HEAD}:src/a.ts\x0012\x00  const needle = 1;  `,
      `${HEAD}:docs/a:b.md\x003\x00needle: here`,
    ]);

    await expect(search.search({ pullRequestId, headSha: HEAD, query: 'needle' })).resolves.toEqual(
      {
        headSha: HEAD,
        source: 'clone',
        matches: [
          { path: 'src/a.ts', line: 12, preview: 'const needle = 1;' },
          { path: 'docs/a:b.md', line: 3, preview: 'needle: here' },
        ],
        partial: false,
      },
    );
    expect(grep).toHaveBeenCalledWith(
      '/code/app',
      expect.arrayContaining(['-F', '-i', '-I', '-e', 'needle', HEAD]),
      MAX_MATCHES + 1,
    );
    expect(provider.getRepositoryFiles).not.toHaveBeenCalled();
  });

  it('says the results are partial when there were more than the limit', async () => {
    const { grep, search } = setup({ hasCommit: true });
    grep.mockResolvedValue(
      Array.from({ length: MAX_MATCHES + 1 }, (_, i) => `${HEAD}:f${i}.ts\x001\x00needle`),
    );

    const result = await search.search({ pullRequestId, headSha: HEAD, query: 'needle' });
    expect(result.matches).toHaveLength(MAX_MATCHES);
    expect(result.partial).toBe(true);
  });
});

describe('RepositorySearch without the commit', () => {
  it('reads files from the provider and finds the text', async () => {
    const { grep, provider, search } = setup({ hasCommit: false });
    provider.getRepositoryFiles.mockResolvedValue({
      paths: ['b.ts', 'a.ts', 'logo.png'],
      truncated: false,
    });
    provider.getFileContent.mockImplementation((_repo, path) =>
      Promise.resolve(path === 'a.ts' ? 'one\nthe Needle\n' : 'nothing\n'),
    );

    await expect(search.search({ pullRequestId, headSha: HEAD, query: 'needle' })).resolves.toEqual(
      {
        headSha: HEAD,
        source: 'github',
        matches: [{ path: 'a.ts', line: 2, preview: 'the Needle' }],
        partial: false,
      },
    );
    expect(grep).not.toHaveBeenCalled();
    expect(provider.getFileContent).not.toHaveBeenCalledWith('octo/app', 'logo.png', HEAD);
  });

  it('says the results are partial when not every file was read', async () => {
    const { provider, search } = setup({ hasCommit: false });
    provider.getRepositoryFiles.mockResolvedValue({
      paths: Array.from({ length: 400 }, (_, i) => `f${i}.ts`),
      truncated: false,
    });
    provider.getFileContent.mockResolvedValue('nothing');

    const result = await search.search({ pullRequestId, headSha: HEAD, query: 'needle' });
    expect(result.partial).toBe(true);
    expect(provider.getFileContent).toHaveBeenCalledTimes(150);
  });

  it('skips binary and unreadable files', async () => {
    const { provider, search } = setup({ hasCommit: false });
    provider.getRepositoryFiles.mockResolvedValue({ paths: ['a.ts', 'b.ts'], truncated: false });
    provider.getFileContent.mockImplementation((_repo, path) =>
      path === 'a.ts' ? Promise.resolve('needle\x00binary') : Promise.reject(new Error('boom')),
    );

    const result = await search.search({ pullRequestId, headSha: HEAD, query: 'needle' });
    expect(result.matches).toEqual([]);
  });
});

describe('repositorySearchInputSchema', () => {
  it('needs a query of at least two characters and a commit', () => {
    const input = { pullRequestId: 1, headSha: HEAD, query: 'ab' };
    expect(repositorySearchInputSchema.safeParse(input).success).toBe(true);
    expect(repositorySearchInputSchema.safeParse({ ...input, query: ' a ' }).success).toBe(false);
    expect(repositorySearchInputSchema.safeParse({ ...input, headSha: '--all' }).success).toBe(
      false,
    );
  });
});
