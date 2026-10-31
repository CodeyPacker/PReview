import { GitHubUnauthorizedError, type Fetch } from '../../services/github/device-flow.ts';

const API_ORIGIN = 'https://api.github.com';
const PER_PAGE = '100';
// Stops a runaway listing. 20 pages is 2000 items.
const MAX_PAGES = 20;

// There is no stored token. The user has to connect GitHub.
export class GitHubNotConnectedError extends Error {}

// GitHub is limiting requests. resetAt is when to try again, when GitHub says.
export class GitHubRateLimitError extends Error {
  constructor(readonly resetAt: Date | undefined) {
    super('GitHub rate limit reached.');
  }
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`GitHub returned ${status} for ${path}.`);
  }
}

export interface GitHubClientDeps {
  fetch: Fetch;
  getToken: () => Promise<string | undefined>;
}

function rateLimitReset(response: Response): Date | undefined {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (retryAfter > 0) return new Date(Date.now() + retryAfter * 1000);
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  return reset > 0 ? new Date(reset * 1000) : undefined;
}

function isRateLimited(response: Response): boolean {
  if (response.status === 429) return true;
  return (
    response.status === 403 &&
    (response.headers.has('retry-after') || response.headers.get('x-ratelimit-remaining') === '0')
  );
}

function nextPageUrl(response: Response): string | undefined {
  const link = response.headers.get('link');
  const match = link ? /<([^>]+)>;\s*rel="next"/.exec(link) : null;
  return match?.[1];
}

// Reads the GitHub REST API with the stored token.
export class GitHubClient {
  constructor(private readonly deps: GitHubClientDeps) {}

  // Fetches every page of a list endpoint. Follows the next link only on api.github.com, so
  // the token never goes anywhere else.
  async getAll(path: string, params: Record<string, string> = {}): Promise<unknown[]> {
    const token = await this.deps.getToken();
    if (!token) throw new GitHubNotConnectedError('GitHub is not connected.');

    const first = new URL(path, API_ORIGIN);
    first.searchParams.set('per_page', PER_PAGE);
    for (const [key, value] of Object.entries(params)) first.searchParams.set(key, value);

    const items: unknown[] = [];
    let url: string | undefined = first.toString();
    for (let page = 0; url && page < MAX_PAGES; page++) {
      if (new URL(url).origin !== API_ORIGIN) break;
      const response = await this.deps.fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (response.status === 401) throw new GitHubUnauthorizedError('GitHub rejected the token.');
      if (isRateLimited(response)) throw new GitHubRateLimitError(rateLimitReset(response));
      if (!response.ok) throw new GitHubApiError(response.status, path);
      const body: unknown = await response.json();
      if (Array.isArray(body)) items.push(...(body as unknown[]));
      url = nextPageUrl(response);
    }
    return items;
  }
}
