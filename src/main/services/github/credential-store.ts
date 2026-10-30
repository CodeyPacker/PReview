import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { githubUserSchema } from '../../../shared/contracts/github.ts';

const credentialsSchema = z.object({ token: z.string(), user: githubUserSchema });
export type GitHubCredentials = z.infer<typeof credentialsSchema>;

// The parts of Electron's safeStorage this store uses. On macOS the encryption key lives
// in the Keychain, on Windows DPAPI protects it, on Linux the Secret Service does.
export interface Encryptor {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class SecureStorageUnavailableError extends Error {}

export interface CredentialStore {
  load(): GitHubCredentials | undefined;
  save(credentials: GitHubCredentials): void;
  clear(): void;
}

// Keeps the GitHub token in one encrypted file, never in SQLite. A file that can't be
// decrypted or parsed reads as no credentials.
export function createCredentialStore(path: string, encryptor: Encryptor): CredentialStore {
  return {
    load() {
      if (!existsSync(path) || !encryptor.isEncryptionAvailable()) return undefined;
      try {
        const parsed = credentialsSchema.safeParse(
          JSON.parse(encryptor.decryptString(readFileSync(path))),
        );
        return parsed.success ? parsed.data : undefined;
      } catch {
        return undefined;
      }
    },
    save(credentials) {
      if (!encryptor.isEncryptionAvailable()) {
        throw new SecureStorageUnavailableError(
          'Secure storage is not available on this computer.',
        );
      }
      writeFileSync(path, encryptor.encryptString(JSON.stringify(credentials)), { mode: 0o600 });
    },
    clear() {
      rmSync(path, { force: true });
    },
  };
}
