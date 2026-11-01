import { GitHubUnauthorizedError, type Fetch } from '../../services/github/device-flow.ts';

const API_ORIGIN = 'https://api.github.com';
const PER_PAGE = '100';
// Stops a runaway listing. 20 pages is 2000 items.
const MAX_PAGES = 20;
const JSON_ACCEPT = 'application/vnd.github+json';
const RAW_ACCEPT = 'application/vnd.github.raw+json';

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
    // GitHub's own explanation, when the response has one. Safe to show the user.
    readonly detail?: string,
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

// The message GitHub gives with an error, such as why a review was refused.
async function errorDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
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
    const first = new URL(path, API_ORIGIN);
    first.searchParams.set('per_page', PER_PAGE);
    for (const [key, value] of Object.entries(params)) first.searchParams.set(key, value);

    const items: unknown[] = [];
    let url: string | undefined = first.toString();
    for (let page = 0; url && page < MAX_PAGES; page++) {
      if (new URL(url).origin !== API_ORIGIN) break;
      const response = await this.request(url, path, JSON_ACCEPT);
      const body: unknown = await response.json();
      if (Array.isArray(body)) items.push(...(body as unknown[]));
      url = nextPageUrl(response);
    }
    return items;
  }

  // Fetches one JSON object.
  async getJson(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const response = await this.request(this.url(path, params), path, JSON_ACCEPT);
    return response.json();
  }

  // Sends a JSON body and returns the JSON response.
  async postJson(path: string, body: unknown): Promise<unknown> {
    const response = await this.request(this.url(path, {}), path, JSON_ACCEPT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  // Sends a JSON body with PUT and returns the JSON response.
  async putJson(path: string, body: unknown): Promise<unknown> {
    const response = await this.request(this.url(path, {}), path, JSON_ACCEPT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  // Fetches a file's raw text. Resolves undefined when GitHub has no such file.
  async getText(path: string, params: Record<string, string> = {}): Promise<string | undefined> {
    try {
      const response = await this.request(this.url(path, params), path, RAW_ACCEPT);
      return await response.text();
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  // Fetches a file's raw bytes. Resolves undefined when GitHub has no such file.
  async getBytes(
    path: string,
    params: Record<string, string> = {},
  ): Promise<Uint8Array | undefined> {
    try {
      const response = await this.request(this.url(path, params), path, RAW_ACCEPT);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  private url(path: string, params: Record<string, string>): string {
    const url = new URL(path, API_ORIGIN);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  }

  private async request(
    url: string,
    path: string,
    accept: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<Response> {
    const token = await this.deps.getToken();
    if (!token) throw new GitHubNotConnectedError('GitHub is not connected.');
    const response = await this.deps.fetch(url, {
      method: init.method,
      body: init.body,
      headers: {
        ...init.headers,
        Accept: accept,
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (response.status === 401) throw new GitHubUnauthorizedError('GitHub rejected the token.');
    if (isRateLimited(response)) throw new GitHubRateLimitError(rateLimitReset(response));
    if (!response.ok) throw new GitHubApiError(response.status, path, await errorDetail(response));
    return response;
  }
}
