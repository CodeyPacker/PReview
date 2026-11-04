import { describe, expect, it } from 'vitest';
import { ghTokenArgs } from './gh-cli.ts';

describe('ghTokenArgs', () => {
  it('reads the active account when no login is given', () => {
    expect(ghTokenArgs()).toEqual(['auth', 'token', '--hostname', 'github.com']);
  });

  it('pins the token to a login', () => {
    expect(ghTokenArgs('octo')).toEqual([
      'auth',
      'token',
      '--hostname',
      'github.com',
      '--user',
      'octo',
    ]);
  });
});
