import type { DatabaseSync } from 'node:sqlite';
import type {
  Repository,
  RepositorySettingsPatch,
  RepositoryStatus,
} from '../../../shared/contracts/repositories.ts';
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

interface ListedRow extends RepositoryRow {
  monitored: number;
  include_drafts: number;
  include_automated: number;
}

const COLUMNS = 'id, path, name, remote_url, github_owner, github_name, root_commit, status';

export function listRepositories(db: DatabaseSync): Repository[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS}, monitored, include_drafts, include_automated FROM repositories
       ORDER BY status, COALESCE(github_owner, '') COLLATE NOCASE, name COLLATE NOCASE, path`,
    )
    .all() as unknown as ListedRow[];
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
    settings: {
      monitored: row.monitored === 1,
      includeDrafts: row.include_drafts === 1,
      includeAutomated: row.include_automated === 1,
    },
  }));
}

const SETTING_COLUMNS = {
  monitored: 'monitored',
  includeDrafts: 'include_drafts',
  includeAutomated: 'include_automated',
} as const;

// Changes only the settings in the patch. An unknown id changes nothing.
export function updateRepositorySettings(
  db: DatabaseSync,
  id: number,
  patch: RepositorySettingsPatch,
): void {
  const changes = Object.entries(SETTING_COLUMNS).flatMap(([key, column]) => {
    const value = patch[key as keyof RepositorySettingsPatch];
    return value === undefined ? [] : [{ column, value: Number(value) }];
  });
  if (changes.length === 0) return;
  db.prepare(
    `UPDATE repositories SET ${changes.map(({ column }) => `${column} = ?`).join(', ')} WHERE id = ?`,
  ).run(...changes.map(({ value }) => value), id);
}

// The repository at a path is the same one when it has the same first commit, and its
// origin has not been pointed at a different repository. A missing root commit (a
// repository with no commits yet) or a missing origin can't contradict the record.
function isSameRepository(row: RepositoryRow, scanned: ScannedRepository): boolean {
  if (row.root_commit && scanned.rootCommit && row.root_commit !== scanned.rootCommit) return false;
  if (row.remote_url && scanned.remoteUrl) {
    return remoteIdentity(row.remote_url) === remoteIdentity(scanned.remoteUrl);
  }
  return true;
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
// A record is reused at its path only when the repository there is the same one. An
// unrelated clone at that path gets a new record and the original stays, unavailable.
// Nothing is deleted, so review history survives a repository that disappears.
export function reconcileRepositories(db: DatabaseSync, found: ScannedRepository[]): void {
  const scanned = [...new Map(found.map((repository) => [repository.path, repository])).values()];
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
    const stored = db
      .prepare(`SELECT ${COLUMNS} FROM repositories`)
      .all() as unknown as RepositoryRow[];

    // Records the scan found again at their own path. An available record is preferred,
    // then the newest.
    const atPath = new Map<ScannedRepository, RepositoryRow>();
    for (const repository of scanned) {
      const same = stored
        .filter((row) => row.path === repository.path && isSameRepository(row, repository))
        .sort(
          (a, b) =>
            Number(b.status === 'available') - Number(a.status === 'available') || b.id - a.id,
        );
      if (same[0]) atPath.set(repository, same[0]);
    }

    const reused = new Set([...atPath.values()].map((row) => row.id));
    const unclaimed = stored.filter((row) => !reused.has(row.id));
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

      const existing = atPath.get(repository) ?? findMoved(repository, unclaimed);
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
