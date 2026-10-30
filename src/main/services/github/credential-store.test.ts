import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCredentialStore, type Encryptor } from './credential-store.ts';

// Reverses the bytes, so the stored file never contains the plain token.
const encryptor: Encryptor = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text).reverse(),
  decryptString: (buffer) => Buffer.from(buffer).reverse().toString(),
};

const credentials = {
  token: 'gho_secret',
  user: { login: 'octo', name: null, avatarUrl: 'https://avatars.example/octo' },
};

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'preview-credentials-'));
  path = join(dir, 'github-credentials');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('credential store', () => {
  it('round-trips credentials through the encryptor', () => {
    const store = createCredentialStore(path, encryptor);
    store.save(credentials);
    expect(readFileSync(path, 'utf8')).not.toContain('gho_secret');
    expect(store.load()).toEqual(credentials);
  });

  it('reads nothing after clear, and clears a missing file', () => {
    const store = createCredentialStore(path, encryptor);
    store.clear();
    store.save(credentials);
    store.clear();
    expect(store.load()).toBeUndefined();
  });

  it('reads an unreadable file as no credentials', () => {
    writeFileSync(path, 'garbage');
    expect(createCredentialStore(path, encryptor).load()).toBeUndefined();
  });

  it('refuses to save without secure storage', () => {
    const store = createCredentialStore(path, { ...encryptor, isEncryptionAvailable: () => false });
    expect(() => store.save(credentials)).toThrow('Secure storage is not available');
  });
});
