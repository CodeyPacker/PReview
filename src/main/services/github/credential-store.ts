import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { githubUserSchema } from '../../../shared/contracts/github.ts';

const credentialsSchema = z.object({ token: z.string(), user: githubUserSchema });
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
