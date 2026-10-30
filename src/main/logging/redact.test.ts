import { describe, expect, it } from 'vitest';
import { redact } from './redact.ts';

const githubToken = 'ghp_' + 'a'.repeat(36);
const fineGrainedToken = 'github_pat_' + 'b'.repeat(40);
const anthropicKey = 'sk-ant-api03-' + 'c'.repeat(40);

describe('redact', () => {
  it('removes tokens and keys from strings', () => {
    expect(redact(`token ${githubToken}`)).toBe('token [REDACTED]');
    expect(redact(`pat=${fineGrainedToken}`)).toBe('pat=[REDACTED]');
    expect(redact(`key=${anthropicKey} end`)).toBe('key=[REDACTED] end');
    expect(redact(`Authorization: Bearer ${'d'.repeat(30)}`)).toBe('Authorization: [REDACTED]');
  });

  it('leaves ordinary text alone', () => {
    expect(redact('Opened PR #482 in acme/web-app')).toBe('Opened PR #482 in acme/web-app');
  });

  it('redacts values under secret-named keys at any depth', () => {
    expect(
      redact({ user: 'cody', password: 'hunter2', nested: { Authorization: 'x', apiKey: 'y' } }),
    ).toEqual({
      user: 'cody',
      password: '[REDACTED]',
      nested: { Authorization: '[REDACTED]', apiKey: '[REDACTED]' },
    });
  });

  it('redacts inside arrays', () => {
    expect(redact(['ok', githubToken])).toEqual(['ok', '[REDACTED]']);
  });

  it('redacts error messages and stacks', () => {
    const result = redact(new Error(`request failed with ${githubToken}`));
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).not.toContain(githubToken);
    expect((result as Error).stack).not.toContain(githubToken);
  });

  it('handles circular references', () => {
    const value: Record<string, unknown> = { a: 1 };
    value.self = value;
    expect(redact(value)).toEqual({ a: 1, self: '[Circular]' });
  });

  it('passes non-plain objects through unchanged', () => {
    const date = new Date(0);
    expect(redact(date)).toBe(date);
  });
});
