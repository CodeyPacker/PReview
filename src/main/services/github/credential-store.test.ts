import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCredentialStore, type Encryptor } from './credential-store.ts';

// Reverses the bytes, so the stored file never contains the plain token.
const encryptor: Encryptor = {
  isEncryptionAvailable: () => Promise.resolve(true),
  encryptString: (text) => Promise.resolve(Buffer.from(text).reverse()),
  decryptString: (buffer) => Promise.resolve(Buffer.from(buffer).reverse().toString()),
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
  it('round-trips credentials through the encryptor', async () => {
    const store = createCredentialStore(path, encryptor);
    await store.save(credentials);
    expect(readFileSync(path, 'utf8')).not.toContain('gho_secret');
    expect(await store.load()).toEqual(credentials);
  });

  it('reads nothing after clear, and clears a missing file', async () => {
    const store = createCredentialStore(path, encryptor);
    store.clear();
    await store.save(credentials);
    store.clear();
    expect(await store.load()).toBeUndefined();
  });

  it('reads an unreadable file as no credentials', async () => {
    writeFileSync(path, 'garbage');
    expect(await createCredentialStore(path, encryptor).load()).toBeUndefined();
  });

  it('refuses to save without secure storage', async () => {
    const store = createCredentialStore(path, {
      ...encryptor,
      isEncryptionAvailable: () => Promise.resolve(false),
    });
    await expect(store.save(credentials)).rejects.toThrow('Secure storage is not available');
  });
});
