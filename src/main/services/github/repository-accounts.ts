import type { DatabaseSync } from 'node:sqlite';

export interface RepositoryAccount {
  login: string;
  // The user picked the account. Otherwise PReview assigned it.
  manual: boolean;
}

// The account assigned to a repository, by owner/name in any case.
export function getRepositoryAccount(
  db: DatabaseSync,
  fullName: string,
): RepositoryAccount | undefined {
  const row = db
    .prepare('SELECT login, manual FROM github_repository_accounts WHERE full_name = ?')
    .get(fullName) as { login: string; manual: number } | undefined;
  return row && { login: row.login, manual: row.manual === 1 };
}

export function setRepositoryAccount(
  db: DatabaseSync,
  fullName: string,
  login: string,
  manual: boolean,
): void {
  db.prepare(
    `INSERT INTO github_repository_accounts (full_name, login, manual) VALUES (?, ?, ?)
     ON CONFLICT (full_name) DO UPDATE SET login = excluded.login, manual = excluded.manual`,
  ).run(fullName, login, manual ? 1 : 0);
}

// Leaves the repository for automatic assignment.
export function clearRepositoryAccount(db: DatabaseSync, fullName: string): void {
  db.prepare('DELETE FROM github_repository_accounts WHERE full_name = ?').run(fullName);
}

// Forgets every assignment to an account, manual ones too, so its repositories go to a
// remaining account.
export function clearAccountRepositories(db: DatabaseSync, login: string): void {
  db.prepare('DELETE FROM github_repository_accounts WHERE login = ?').run(login);
}
