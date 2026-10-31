import { describe, expect, it } from 'vitest';
import type { PullRequest } from '../../shared/contracts/pull-requests.ts';
import { filterPullRequests } from './filterPullRequests.ts';

function pull(id: number, overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id,
    repositoryId: 1,
    number: id,
    title: `Change ${id}`,
    draft: false,
    url: `https://github.com/octo/app/pull/${id}`,
    author: { login: 'hubot', avatarUrl: 'https://avatars.example/hubot', bot: false },
    headBranch: 'feature',
    headSha: 'abc',
    baseBranch: 'main',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
    ...overrides,
  };
}

const names = new Map([
  [1, 'octo/app'],
  [2, 'octo/api'],
]);
const pulls = [
  pull(1, { title: 'Add search' }),
  pull(2, { repositoryId: 2, author: null }),
  pull(3, { author: { login: 'Mona', avatarUrl: '', bot: false } }),
];

describe('filterPullRequests', () => {
  it('keeps everything without a filter', () => {
    expect(filterPullRequests(pulls, names, { search: ' ', repositoryId: undefined })).toEqual(
      pulls,
    );
  });

  it('filters by repository', () => {
    const result = filterPullRequests(pulls, names, { search: '', repositoryId: 2 });
    expect(result.map((p) => p.id)).toEqual([2]);
  });

  it('searches title, number, author and repository without regard to case', () => {
    const search = (text: string) =>
      filterPullRequests(pulls, names, { search: text, repositoryId: undefined }).map((p) => p.id);
    expect(search('SEARCH')).toEqual([1]);
    expect(search('#2')).toEqual([2]);
    expect(search('mona')).toEqual([3]);
    expect(search('octo/api')).toEqual([2]);
    expect(search('nothing')).toEqual([]);
  });

  it('combines the repository and the search', () => {
    const result = filterPullRequests(pulls, names, { search: 'change', repositoryId: 1 });
    expect(result.map((p) => p.id)).toEqual([3]);
  });
});
