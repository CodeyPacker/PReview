import type { DatabaseSync } from 'node:sqlite';
import type { Repository, RepositoryStatus } from '../../../shared/contracts/repositories.ts';
import { transaction } from '../../database/connection.ts';
import { githubRepoFromRemote, remoteIdentity, stripCredentials } from './remote.ts';

export interface ScannedRepository {
  path: string;
  name: string;
  remoteUrl: string | null;
  rootCommit: string | null;
}

interface RepositoryRow {
  id: number;
  path: string;
  name: string;
  remote_url: string | null;
  github_owner: string | null;
  github_name: string | null;
  root_commit: string | null;
  status: RepositoryStatus;
}

const COLUMNS = 'id, path, name, remote_url, github_owner, github_name, root_commit, status';

export function listRepositories(db: DatabaseSync): Repository[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM repositories
       ORDER BY status, COALESCE(github_owner, '') COLLATE NOCASE, name COLLATE NOCASE, path`,
    )
    .all() as unknown as RepositoryRow[];
  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    name: row.name,
    remoteUrl: row.remote_url,
    github:
      row.github_owner && row.github_name
        ? { owner: row.github_owner, name: row.github_name }
        : null,
    status: row.status,
  }));
}

// A moved repository has the same root commit and the same origin as an unavailable one.
// Two such candidates, or a repository with no commits, leave the match unclear, and an
// unclear match registers a new repository instead of guessing.
function findMoved(
  scanned: ScannedRepository,
  candidates: readonly RepositoryRow[],
): RepositoryRow | undefined {
  if (!scanned.rootCommit) return undefined;
  const identity = scanned.remoteUrl ? remoteIdentity(scanned.remoteUrl) : null;
  const matches = candidates.filter(
    (row) =>
      row.root_commit === scanned.rootCommit &&
      (row.remote_url ? remoteIdentity(row.remote_url) : null) === identity,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

// Brings the stored repositories in line with a full scan: updates what was found,
// reconnects moved repositories, registers new ones and marks the rest unavailable.
// Nothing is deleted, so review history survives a repository that disappears.
export function reconcileRepositories(db: DatabaseSync, scanned: ScannedRepository[]): void {
  const update = db.prepare(`
    UPDATE repositories SET
      path = ?, name = ?, remote_url = ?, github_owner = ?, github_name = ?, root_commit = ?,
      status = 'available', last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `);
  const insert = db.prepare(`
    INSERT INTO repositories
      (path, name, remote_url, github_owner, github_name, root_commit, status)
    VALUES (?, ?, ?, ?, ?, ?, 'available')
  `);

  const markUnavailable = db.prepare("UPDATE repositories SET status = 'unavailable' WHERE id = ?");

  transaction(db, () => {
    const seen = new Set(scanned.map((repository) => repository.path));
    const stored = db
      .prepare(`SELECT ${COLUMNS} FROM repositories`)
      .all() as unknown as RepositoryRow[];
    const byPath = new Map(stored.map((row) => [row.path, row]));
    const unclaimed = stored.filter((row) => !seen.has(row.path));

    for (const row of unclaimed) markUnavailable.run(row.id);

    for (const repository of scanned) {
      const remoteUrl = repository.remoteUrl ? stripCredentials(repository.remoteUrl) : null;
      const github = remoteUrl ? githubRepoFromRemote(remoteUrl) : undefined;
      const values = [
        repository.path,
        repository.name,
        remoteUrl,
        github?.owner ?? null,
        github?.name ?? null,
        repository.rootCommit,
      ] as const;

      const existing = byPath.get(repository.path) ?? findMoved(repository, unclaimed);
      if (existing) {
        update.run(...values, existing.id);
        const index = unclaimed.indexOf(existing);
        if (index !== -1) unclaimed.splice(index, 1);
      } else {
        insert.run(...values);
      }
    }
  });
}
