import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import { listRepositories, reconcileRepositories, type ScannedRepository } from './registry.ts';

function scanned(path: string, overrides: Partial<ScannedRepository> = {}): ScannedRepository {
  return {
    path,
    name: path.split('/').at(-1) ?? path,
    remoteUrl: 'git@github.com:octo/hello.git',
    rootCommit: 'root-1',
    ...overrides,
  };
}

let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('reconcileRepositories', () => {
  it('registers a repository with its GitHub name', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    expect(listRepositories(db)).toEqual([
      {
        id: 1,
        path: '/code/hello',
        name: 'hello',
        remoteUrl: 'git@github.com:octo/hello.git',
        github: { owner: 'octo', name: 'hello' },
        status: 'available',
      },
    ]);
  });

  it('keeps a repository without a GitHub remote, with no GitHub name', () => {
    reconcileRepositories(db, [
      scanned('/code/local', { remoteUrl: null }),
      scanned('/code/lab', { remoteUrl: 'https://gitlab.com/octo/lab.git', rootCommit: 'root-2' }),
    ]);
    expect(listRepositories(db).map((repository) => repository.github)).toEqual([null, null]);
  });

  it('never stores credentials from the remote', () => {
    reconcileRepositories(db, [
      scanned('/code/hello', { remoteUrl: 'https://ghp_secret@github.com/octo/hello.git' }),
    ]);
    expect(listRepositories(db)).toMatchObject([
      {
        remoteUrl: 'https://github.com/octo/hello.git',
        github: { owner: 'octo', name: 'hello' },
      },
    ]);
  });

  it('does not register the same repository twice', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [scanned('/code/hello'), scanned('/code/hello')]);
    expect(listRepositories(db)).toHaveLength(1);
  });

  it('marks a missing repository unavailable and keeps it', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, []);
    expect(listRepositories(db).map(({ path, status }) => ({ path, status }))).toEqual([
      { path: '/code/hello', status: 'unavailable' },
    ]);
  });

  it('makes a repository available again when it returns to the same path', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, []);
    reconcileRepositories(db, [scanned('/code/hello')]);
    const [repository] = listRepositories(db);
    expect(repository).toMatchObject({ id: 1, status: 'available' });
  });

  it('keeps the original as unavailable when an unrelated clone takes its path', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [
      scanned('/code/hello', {
        rootCommit: 'root-other',
        remoteUrl: 'git@github.com:other/thing.git',
      }),
    ]);
    expect(listRepositories(db)).toMatchObject([
      {
        id: 2,
        path: '/code/hello',
        github: { owner: 'other', name: 'thing' },
        status: 'available',
      },
      {
        id: 1,
        path: '/code/hello',
        github: { owner: 'octo', name: 'hello' },
        status: 'unavailable',
      },
    ]);
  });

  it('treats a different root commit alone as a different repository', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [scanned('/code/hello', { rootCommit: 'root-other' })]);
    expect(listRepositories(db).map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 2, status: 'available' },
      { id: 1, status: 'unavailable' },
    ]);
  });

  it('treats a different origin alone as a different repository', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [
      scanned('/code/hello', { remoteUrl: 'git@github.com:fork/hello.git' }),
    ]);
    expect(listRepositories(db).map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 2, status: 'available' },
      { id: 1, status: 'unavailable' },
    ]);
  });

  it('keeps the record when the repository at the path gains its first commit or origin', () => {
    reconcileRepositories(db, [scanned('/code/new', { rootCommit: null, remoteUrl: null })]);
    reconcileRepositories(db, [scanned('/code/new')]);
    expect(listRepositories(db)).toMatchObject([{ id: 1, status: 'available' }]);
  });

  it('reuses the original record when it returns after a replacement left', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [scanned('/code/hello', { rootCommit: 'root-other' })]);
    reconcileRepositories(db, [scanned('/code/hello')]);
    expect(listRepositories(db).map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 1, status: 'available' },
      { id: 2, status: 'unavailable' },
    ]);
  });

  it('reconnects the displaced original when it turns up elsewhere', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [
      scanned('/code/hello', {
        rootCommit: 'root-other',
        remoteUrl: 'git@github.com:other/thing.git',
      }),
      scanned('/work/hello'),
    ]);
    expect(listRepositories(db).map(({ id, path, status }) => ({ id, path, status }))).toEqual([
      { id: 1, path: '/work/hello', status: 'available' },
      { id: 2, path: '/code/hello', status: 'available' },
    ]);
  });

  it('reconnects a moved repository to its record', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [scanned('/work/hello-renamed')]);
    expect(listRepositories(db)).toMatchObject([
      { id: 1, path: '/work/hello-renamed', name: 'hello-renamed', status: 'available' },
    ]);
  });

  it('reconnects a repository whose remote changed protocol', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [
      scanned('/work/hello', { remoteUrl: 'https://github.com/octo/hello.git' }),
    ]);
    expect(listRepositories(db)).toHaveLength(1);
  });

  it('registers a second clone separately while the first is still available', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [scanned('/code/hello'), scanned('/work/hello')]);
    expect(listRepositories(db).map((repository) => repository.status)).toEqual([
      'available',
      'available',
    ]);
  });

  it('does not match an unrelated repository with another root commit', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [scanned('/work/hello', { rootCommit: 'root-other' })]);
    expect(listRepositories(db).map(({ path, status }) => ({ path, status }))).toEqual([
      { path: '/work/hello', status: 'available' },
      { path: '/code/hello', status: 'unavailable' },
    ]);
  });

  it('does not match a repository with another remote', () => {
    reconcileRepositories(db, [scanned('/code/hello')]);
    reconcileRepositories(db, [
      scanned('/work/fork', { remoteUrl: 'git@github.com:someone/hello.git' }),
    ]);
    expect(listRepositories(db)).toHaveLength(2);
  });

  it('does not match a repository without commits', () => {
    reconcileRepositories(db, [scanned('/code/empty', { rootCommit: null, remoteUrl: null })]);
    reconcileRepositories(db, [scanned('/work/empty', { rootCommit: null, remoteUrl: null })]);
    expect(listRepositories(db)).toHaveLength(2);
  });

  it('registers a new repository when two unavailable ones could match', () => {
    reconcileRepositories(db, [scanned('/a/hello'), scanned('/b/hello')]);
    reconcileRepositories(db, []);
    reconcileRepositories(db, [scanned('/c/hello')]);
    expect(listRepositories(db)).toHaveLength(3);
  });

  it('lists available repositories first', () => {
    reconcileRepositories(db, [scanned('/code/zeta', { rootCommit: 'z', remoteUrl: null })]);
    reconcileRepositories(db, [scanned('/code/alpha', { rootCommit: 'a', remoteUrl: null })]);
    expect(listRepositories(db).map((repository) => repository.name)).toEqual(['alpha', 'zeta']);
  });
});
