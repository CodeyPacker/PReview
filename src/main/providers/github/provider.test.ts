import { describe, expect, it, vi } from 'vitest';
import { GitHubUnauthorizedError, type Fetch } from '../../services/github/device-flow.ts';
import {
  GitHubApiError,
  GitHubClient,
  GitHubNotConnectedError,
  GitHubRateLimitError,
} from './client.ts';
import { GitHubProvider } from './provider.ts';

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), init);
}

function setup(responses: Response[], token: string | null = 'token-1') {
  const queue = [...responses];
  const fetch = vi.fn<Fetch>(() => {
    const next = queue.shift();
    if (!next) throw new Error('Unexpected request');
    return Promise.resolve(next);
  });
  const provider = new GitHubProvider(
    new GitHubClient({ fetch, getToken: () => Promise.resolve(token ?? undefined) }),
  );
  return { fetch, provider };
}

function requestedUrl(fetch: ReturnType<typeof vi.fn<Fetch>>, call: number): string {
  const [input] = fetch.mock.calls[call] ?? [];
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  throw new Error('Expected a string or URL request');
}

function urlOf(fetch: ReturnType<typeof vi.fn<Fetch>>, call: number): URL {
  return new URL(requestedUrl(fetch, call));
}

const repository = {
  id: 1,
  full_name: 'octo/app',
  name: 'app',
  owner: { login: 'octo' },
  default_branch: 'main',
  private: true,
  archived: false,
  permissions: { push: true },
};

function pull(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    number: 7,
    title: 'Add search',
    draft: false,
    html_url: 'https://github.com/octo/app/pull/7',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    user: { login: 'hubot', avatar_url: 'https://avatars.example/hubot' },
    head: { ref: 'feat/search', sha: 'abc123', repo: { id: 1 } },
    base: { ref: 'main', repo: { id: 1 } },
    ...overrides,
  };
}

describe('GitHubProvider.getRepositories', () => {
  it('maps repositories and sends the token', async () => {
    const { fetch, provider } = setup([json([repository])]);
    await expect(provider.getRepositories()).resolves.toEqual([
      {
        provider: 'github',
        providerId: '1',
        fullName: 'octo/app',
        owner: 'octo',
        name: 'app',
        defaultBranch: 'main',
        private: true,
        archived: false,
        canPush: true,
      },
    ]);
    expect(urlOf(fetch, 0).pathname).toBe('/user/repos');
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-1' });
  });

  it('treats missing permissions as read-only', async () => {
    const { provider } = setup([json([{ ...repository, permissions: undefined }])]);
    const [result] = await provider.getRepositories();
    expect(result?.canPush).toBe(false);
  });

  it('follows next links across pages', async () => {
    const next = 'https://api.github.com/user/repos?page=2';
    const { fetch, provider } = setup([
      json([repository], { headers: { link: `<${next}>; rel="next"` } }),
      json([{ ...repository, id: 2, full_name: 'octo/two', name: 'two' }]),
    ]);
    const result = await provider.getRepositories();
    expect(result.map((r) => r.fullName)).toEqual(['octo/app', 'octo/two']);
    expect(requestedUrl(fetch, 1)).toBe(next);
  });

  it('does not send the token to another host', async () => {
    const { fetch, provider } = setup([
      json([repository], { headers: { link: '<https://evil.example/page2>; rel="next"' } }),
    ]);
    await provider.getRepositories();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('GitHubProvider.getPullRequests', () => {
  it('maps open pull requests', async () => {
    const { fetch, provider } = setup([json([pull()])]);
    await expect(provider.getPullRequests('octo/app')).resolves.toEqual([
      {
        provider: 'github',
        providerId: '100',
        number: 7,
        title: 'Add search',
        draft: false,
        url: 'https://github.com/octo/app/pull/7',
        author: { login: 'hubot', avatarUrl: 'https://avatars.example/hubot', bot: false },
        headBranch: 'feat/search',
        headSha: 'abc123',
        baseBranch: 'main',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
      },
    ]);
    const url = urlOf(fetch, 0);
    expect(url.pathname).toBe('/repos/octo/app/pulls');
    expect(url.searchParams.get('state')).toBe('open');
  });

  it('leaves out fork-origin pull requests', async () => {
    const { provider } = setup([
      json([
        pull({ number: 1 }),
        pull({ number: 2, head: { ref: 'x', sha: 'b', repo: { id: 99 } } }),
        pull({ number: 3, head: { ref: 'y', sha: 'c', repo: null } }),
      ]),
    ]);
    const result = await provider.getPullRequests('octo/app');
    expect(result.map((p) => p.number)).toEqual([1]);
  });

  it('flags pull requests opened by bots', async () => {
    const bot = {
      login: 'dependabot[bot]',
      avatar_url: 'https://avatars.example/bot',
      type: 'Bot',
    };
    const { provider } = setup([json([pull({ user: bot }), pull({ number: 8 })])]);
    const result = await provider.getPullRequests('octo/app');
    expect(result.map((p) => p.author?.bot)).toEqual([true, false]);
  });

  it('keeps pull requests from deleted users', async () => {
    const { provider } = setup([json([pull({ user: null })])]);
    const [result] = await provider.getPullRequests('octo/app');
    expect(result?.author).toBeNull();
  });
});

describe('GitHubClient errors', () => {
  it('throws when there is no token', async () => {
    const { fetch, provider } = setup([], null);
    await expect(provider.getRepositories()).rejects.toBeInstanceOf(GitHubNotConnectedError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws an unauthorized error on 401', async () => {
    const { provider } = setup([json({}, { status: 401 })]);
    await expect(provider.getRepositories()).rejects.toBeInstanceOf(GitHubUnauthorizedError);
  });

  it('reports the reset time on a rate limit', async () => {
    const reset = Math.floor(Date.now() / 1000) + 60;
    const { provider } = setup([
      json(
        {},
        {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
        },
      ),
    ]);
    const error = await provider.getRepositories().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubRateLimitError);
    expect((error as GitHubRateLimitError).resetAt).toEqual(new Date(reset * 1000));
  });

  it('reads retry-after on 429', async () => {
    const { provider } = setup([json({}, { status: 429, headers: { 'retry-after': '30' } })]);
    const error = await provider.getRepositories().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubRateLimitError);
    expect((error as GitHubRateLimitError).resetAt).toBeInstanceOf(Date);
  });

  it('does not call a plain 403 a rate limit', async () => {
    const { provider } = setup([json({}, { status: 403 })]);
    await expect(provider.getPullRequests('octo/app')).rejects.toBeInstanceOf(GitHubApiError);
  });

  it('throws an API error on other failures', async () => {
    const { provider } = setup([json({}, { status: 404 })]);
    await expect(provider.getPullRequests('octo/gone')).rejects.toMatchObject({ status: 404 });
  });
});

describe('GitHubProvider changed files', () => {
  it('reads where a pull request is now', async () => {
    const { fetch, provider } = setup([
      json({ head: { sha: 'headsha' }, base: { ref: 'release/1' } }),
    ]);

    await expect(provider.getPullRequestRefs('octo/app', 7)).resolves.toEqual({
      headSha: 'headsha',
      baseBranch: 'release/1',
    });
    expect(urlOf(fetch, 0).pathname).toBe('/repos/octo/app/pulls/7');
  });

  it('lists the files of a pull request', async () => {
    const { fetch, provider } = setup([
      json([
        {
          filename: 'src/a.ts',
          status: 'modified',
          additions: 3,
          deletions: 1,
          patch: '@@ -1,3 +1,5 @@\n a\n-b\n+b2\n+b3\n+b4\n c',
        },
        {
          filename: 'src/b.ts',
          previous_filename: 'src/old.ts',
          status: 'renamed',
          additions: 0,
          deletions: 0,
        },
        { filename: 'src/c.ts', status: 'unchanged', additions: 0, deletions: 0 },
      ]),
    ]);

    await expect(provider.getPullRequestFiles('octo/app', 7)).resolves.toEqual([
      {
        path: 'src/a.ts',
        previousPath: null,
        status: 'modified',
        additions: 3,
        deletions: 1,
        hunks: [{ originalStart: 1, originalCount: 3, modifiedStart: 1, modifiedCount: 5 }],
      },
      {
        path: 'src/b.ts',
        previousPath: 'src/old.ts',
        status: 'renamed',
        additions: 0,
        deletions: 0,
        hunks: null,
      },
      {
        path: 'src/c.ts',
        previousPath: null,
        status: 'changed',
        additions: 0,
        deletions: 0,
        hunks: null,
      },
    ]);
    expect(urlOf(fetch, 0).pathname).toBe('/repos/octo/app/pulls/7/files');
  });

  it('finds the merge base of a pull request', async () => {
    const { fetch, provider } = setup([json({ merge_base_commit: { sha: 'abc123' } })]);

    await expect(provider.getMergeBase('octo/app', 'release/1', 'headsha')).resolves.toBe('abc123');
    expect(urlOf(fetch, 0).pathname).toBe('/repos/octo/app/compare/release%2F1...headsha');
  });

  it('reads a file at a commit as raw text', async () => {
    const { fetch, provider } = setup([new Response('const a = 1;\n')]);

    await expect(provider.getFileContent('octo/app', 'src/my file.ts', 'abc')).resolves.toBe(
      'const a = 1;\n',
    );
    const url = urlOf(fetch, 0);
    expect(url.pathname).toBe('/repos/octo/app/contents/src/my%20file.ts');
    expect(url.searchParams.get('ref')).toBe('abc');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('accept')).toBe(
      'application/vnd.github.raw+json',
    );
  });

  it('returns undefined for a file that does not exist at the commit', async () => {
    const { provider } = setup([new Response('', { status: 404 })]);

    await expect(provider.getFileContent('octo/app', 'gone.ts', 'abc')).resolves.toBeUndefined();
  });
});

function sentBody(fetch: ReturnType<typeof vi.fn<Fetch>>): Record<string, unknown> {
  const body = fetch.mock.calls[0]?.[1]?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON body');
  return JSON.parse(body) as Record<string, unknown>;
}

describe('GitHubProvider submitReview', () => {
  it('posts the review against the commit that was reviewed', async () => {
    const { fetch, provider } = setup([json({ id: 1 })]);

    await provider.submitReview('octo/app', 7, {
      verdict: 'request-changes',
      body: 'Please fix the tests.',
      headSha: 'abc123',
      comments: [],
    });

    expect(urlOf(fetch, 0).pathname).toBe('/repos/octo/app/pulls/7/reviews');
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(sentBody(fetch)).toEqual({
      commit_id: 'abc123',
      body: 'Please fix the tests.',
      event: 'REQUEST_CHANGES',
      comments: [],
    });
  });

  it('sends line comments on either side, and comments on several lines', async () => {
    const { fetch, provider } = setup([json({ id: 1 })]);

    await provider.submitReview('octo/app', 7, {
      verdict: 'comment',
      body: 'Notes.',
      headSha: 'abc',
      comments: [
        { path: 'a.ts', side: 'modified', startLine: null, line: 3, body: 'Rename.' },
        { path: 'b.ts', side: 'original', startLine: 10, line: 12, body: 'Why remove these?' },
      ],
    });

    expect(sentBody(fetch).comments).toEqual([
      { path: 'a.ts', body: 'Rename.', line: 3, side: 'RIGHT' },
      {
        path: 'b.ts',
        body: 'Why remove these?',
        line: 12,
        side: 'LEFT',
        start_line: 10,
        start_side: 'LEFT',
      },
    ]);
  });

  it.each([
    ['approve', 'APPROVE'],
    ['comment', 'COMMENT'],
  ] as const)('sends %s as %s', async (verdict, event) => {
    const { fetch, provider } = setup([json({ id: 1 })]);

    await provider.submitReview('octo/app', 7, { verdict, body: '', headSha: 'abc', comments: [] });

    expect(sentBody(fetch).event).toBe(event);
  });

  it("keeps GitHub's explanation when it refuses the review", async () => {
    const { provider } = setup([
      json({ message: 'Can not approve your own pull request' }, { status: 422 }),
    ]);

    await expect(
      provider.submitReview('octo/app', 7, {
        verdict: 'approve',
        body: '',
        headSha: 'abc',
        comments: [],
      }),
    ).rejects.toMatchObject({ status: 422, detail: 'Can not approve your own pull request' });
  });
});
