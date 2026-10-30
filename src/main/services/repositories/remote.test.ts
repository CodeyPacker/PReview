import { describe, expect, it } from 'vitest';
import { githubRepoFromRemote, remoteIdentity, stripCredentials } from './remote.ts';

describe('githubRepoFromRemote', () => {
  it.each([
    'https://github.com/octo/hello.git',
    'https://github.com/octo/hello',
    'https://github.com/octo/hello/',
    'git@github.com:octo/hello.git',
    'ssh://git@github.com/octo/hello.git',
  ])('reads the owner and name from %s', (remote) => {
    expect(githubRepoFromRemote(remote)).toEqual({ owner: 'octo', name: 'hello' });
  });

  it.each([
    'https://gitlab.com/octo/hello.git',
    'git@github.example.com:octo/hello.git',
    'https://github.com/octo',
    'https://github.com/octo/hello/extra',
    '/Users/me/projects/hello',
    'C:\\projects\\hello',
  ])('does not read %s as a GitHub repository', (remote) => {
    expect(githubRepoFromRemote(remote)).toBeUndefined();
  });
});

describe('stripCredentials', () => {
  it('removes a token or password from an https remote', () => {
    expect(stripCredentials('https://ghp_secret@github.com/octo/hello.git')).toBe(
      'https://github.com/octo/hello.git',
    );
    expect(stripCredentials('https://octo:secret@github.com/octo/hello.git')).toBe(
      'https://github.com/octo/hello.git',
    );
  });

  it('keeps the git user of an ssh remote', () => {
    expect(stripCredentials('ssh://git@github.com/octo/hello.git')).toBe(
      'ssh://git@github.com/octo/hello.git',
    );
    expect(stripCredentials('git@github.com:octo/hello.git')).toBe('git@github.com:octo/hello.git');
  });
});

describe('remoteIdentity', () => {
  it('matches one repository across protocols and case', () => {
    const identity = remoteIdentity('https://GitHub.com/Octo/Hello.git');
    expect(remoteIdentity('git@github.com:octo/hello.git')).toBe(identity);
    expect(remoteIdentity('ssh://git@github.com/octo/hello')).toBe(identity);
  });

  it('tells different repositories apart', () => {
    expect(remoteIdentity('git@github.com:octo/hello.git')).not.toBe(
      remoteIdentity('git@github.com:octo/other.git'),
    );
  });
});
