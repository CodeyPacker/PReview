import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { githubUserSchema } from '../../../shared/contracts/github.ts';

// A CLI connection stores no token, since gh keeps it. Files saved before the CLI option
// have no source and read as oauth.
const credentialsSchema = z.union([
  z.object({ source: z.literal('cli'), user: githubUserSchema }),
  z.object({
    source: z.literal('oauth').default('oauth'),
    token: z.string(),
    user: githubUserSchema,
  }),
]);
export type GitHubCredentials = z.infer<typeof credentialsSchema>;

// The parts of Electron's safeStorage this store uses. On macOS the encryption key lives
// in the Keychain, on Windows DPAPI protects it, on Linux the Secret Service does.
export interface Encryptor {
  isEncryptionAvailable(): Promise<boolean>;
  encryptString(plainText: string): Promise<Buffer>;
  decryptString(encrypted: Buffer): Promise<string>;
}

export class SecureStorageUnavailableError extends Error {}

export interface CredentialStore {
  load(): Promise<GitHubCredentials | undefined>;
  save(credentials: GitHubCredentials): Promise<void>;
  clear(): void;
}

// Keeps the GitHub token in one encrypted file, never in SQLite. A file that can't be
// decrypted or parsed reads as no credentials.
export function createCredentialStore(path: string, encryptor: Encryptor): CredentialStore {
  return {
    async load() {
      if (!existsSync(path) || !(await encryptor.isEncryptionAvailable())) return undefined;
      try {
        const parsed = credentialsSchema.safeParse(
          JSON.parse(await encryptor.decryptString(readFileSync(path))),
        );
        return parsed.success ? parsed.data : undefined;
      } catch {
        return undefined;
      }
    },
    async save(credentials) {
      if (!(await encryptor.isEncryptionAvailable())) {
        throw new SecureStorageUnavailableError(
          'Secure storage is not available on this computer.',
        );
      }
      writeFileSync(path, await encryptor.encryptString(JSON.stringify(credentials)), {
        mode: 0o600,
      });
    },
    clear() {
      rmSync(path, { force: true });
    },
  };
}

// GitHub logins are letters, digits and hyphens, at most 39 characters. Checked before a login
// names a file, so a login can never point outside the credentials folder.
const LOGIN = /^[a-z\d][a-z\d-]{0,38}$/i;

export function isGitHubLogin(login: string): boolean {
  return LOGIN.test(login);
}

// One encrypted credential file per account, named by the lowercase login.
export interface CredentialDirectory {
  // The lowercase logins that have a credential file, sorted.
  logins(): string[];
  store(login: string): CredentialStore;
}

export function createCredentialDirectory(dir: string, encryptor: Encryptor): CredentialDirectory {
  return {
    logins() {
      if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && isGitHubLogin(entry.name))
        .map((entry) => entry.name.toLowerCase())
        .sort();
    },
    store(login) {
      if (!isGitHubLogin(login)) throw new Error('Not a GitHub login.');
      const store = createCredentialStore(join(dir, login.toLowerCase()), encryptor);
      return {
        load: () => store.load(),
        async save(credentials) {
          mkdirSync(dir, { recursive: true, mode: 0o700 });
          await store.save(credentials);
        },
        clear: () => store.clear(),
      };
    },
  };
}

// Moves the single credential file from before multiple accounts into the folder that now has
// its name. Each step can run again after a crash. The old file is deleted only once the new
// one is written, or when it holds nothing readable.
export async function moveLegacyCredentials(dir: string, encryptor: Encryptor): Promise<void> {
  const legacy = `${dir}.legacy`;
  if (existsSync(dir) && statSync(dir).isFile()) renameSync(dir, legacy);
  if (!existsSync(legacy)) return;
  // Without secure storage the file can't be read yet. It waits for a later start.
  if (!(await encryptor.isEncryptionAvailable())) return;
  const stored = await createCredentialStore(legacy, encryptor).load();
  if (stored && isGitHubLogin(stored.user.login)) {
    await createCredentialDirectory(dir, encryptor).store(stored.user.login).save(stored);
  }
  rmSync(legacy, { force: true });
}
