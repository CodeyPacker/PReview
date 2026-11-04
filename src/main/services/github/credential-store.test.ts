import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCredentialDirectory,
  createCredentialStore,
  moveLegacyCredentials,
  type Encryptor,
} from './credential-store.ts';

// Reverses the bytes, so the stored file never contains the plain token.
const encryptor: Encryptor = {
  isEncryptionAvailable: () => Promise.resolve(true),
  encryptString: (text) => Promise.resolve(Buffer.from(text).reverse()),
  decryptString: (buffer) => Promise.resolve(Buffer.from(buffer).reverse().toString()),
};

const user = { login: 'octo', name: null, avatarUrl: 'https://avatars.example/octo' };
const credentials = { source: 'oauth' as const, token: 'gho_secret', user };

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

  it('round-trips a CLI connection, which has no token', async () => {
    const store = createCredentialStore(path, encryptor);
    await store.save({ source: 'cli', user });
    expect(await store.load()).toEqual({ source: 'cli', user });
  });

  it('reads a file saved before the CLI option as oauth', async () => {
    writeFileSync(path, await encryptor.encryptString(JSON.stringify({ token: 'gho_old', user })));
    expect(await createCredentialStore(path, encryptor).load()).toEqual({
      source: 'oauth',
      token: 'gho_old',
      user,
    });
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

describe('credential directory', () => {
  it('keeps one file per login, named in lowercase', async () => {
    const directory = createCredentialDirectory(path, encryptor);
    expect(directory.logins()).toEqual([]);
    await directory.store('Octo').save(credentials);
    await directory.store('hubot').save({ source: 'cli', user: { ...user, login: 'hubot' } });

    expect(directory.logins()).toEqual(['hubot', 'octo']);
    expect(await directory.store('OCTO').load()).toEqual(credentials);
    directory.store('octo').clear();
    expect(directory.logins()).toEqual(['hubot']);
  });

  it('refuses a login that could name a path', () => {
    const directory = createCredentialDirectory(path, encryptor);
    expect(() => directory.store('../octo')).toThrow('Not a GitHub login');
    expect(() => directory.store('')).toThrow('Not a GitHub login');
  });

  it('ignores files that are not named by a login', () => {
    mkdirSync(path);
    writeFileSync(join(path, '.DS_Store'), '');
    expect(createCredentialDirectory(path, encryptor).logins()).toEqual([]);
  });
});

describe('moveLegacyCredentials', () => {
  const writeLegacy = async (at: string) =>
    writeFileSync(at, await encryptor.encryptString(JSON.stringify(credentials)));
  const logins = () => createCredentialDirectory(path, encryptor).logins();

  it('moves the old file into the folder of the same name', async () => {
    await writeLegacy(path);
    await moveLegacyCredentials(path, encryptor);

    expect(logins()).toEqual(['octo']);
    expect(await createCredentialDirectory(path, encryptor).store('octo').load()).toEqual(
      credentials,
    );
    expect(existsSync(`${path}.legacy`)).toBe(false);
  });

  it('finishes a move that stopped after the rename', async () => {
    await writeLegacy(`${path}.legacy`);
    await moveLegacyCredentials(path, encryptor);
    expect(logins()).toEqual(['octo']);
    expect(existsSync(`${path}.legacy`)).toBe(false);
  });

  it('finishes a move that stopped after writing the new file', async () => {
    await createCredentialDirectory(path, encryptor).store('octo').save(credentials);
    await writeLegacy(`${path}.legacy`);
    await moveLegacyCredentials(path, encryptor);
    expect(logins()).toEqual(['octo']);
    expect(existsSync(`${path}.legacy`)).toBe(false);
  });

  it('keeps the old file while secure storage is unavailable', async () => {
    await writeLegacy(path);
    await moveLegacyCredentials(path, {
      ...encryptor,
      isEncryptionAvailable: () => Promise.resolve(false),
    });
    expect(existsSync(`${path}.legacy`)).toBe(true);

    await moveLegacyCredentials(path, encryptor);
    expect(logins()).toEqual(['octo']);
  });

  it('drops an old file that holds nothing readable', async () => {
    writeFileSync(path, 'garbage');
    await moveLegacyCredentials(path, encryptor);
    expect(existsSync(`${path}.legacy`)).toBe(false);
    expect(logins()).toEqual([]);
  });

  it('does nothing on a new install or after the move', async () => {
    await moveLegacyCredentials(path, encryptor);
    expect(existsSync(path)).toBe(false);
    await createCredentialDirectory(path, encryptor).store('octo').save(credentials);
    await moveLegacyCredentials(path, encryptor);
    expect(logins()).toEqual(['octo']);
  });
});
