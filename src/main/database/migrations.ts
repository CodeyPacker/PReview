export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Append only. Never edit a migration that has shipped; add a new one instead.
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'settings',
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: 'watched_folders_and_repositories',
    sql: `
      CREATE TABLE watched_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        scan_depth INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      -- A repository is identified by its root commit and origin remote, not its path,
      -- so a moved repository can be reconnected. status is 'available' or 'unavailable'.
      CREATE TABLE repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        remote_url TEXT,
        github_owner TEXT,
        github_name TEXT,
        root_commit TEXT,
        status TEXT NOT NULL CHECK (status IN ('available', 'unavailable')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX repositories_root_commit ON repositories (root_commit);
    `,
  },
  {
    version: 3,
    name: 'repository_path_unique_while_available',
    // A repository replaced by an unrelated one at the same path stays as an unavailable
    // record under that path, so only available repositories need unique paths. SQLite
    // can't drop a column constraint, so the table is rebuilt.
    sql: `
      CREATE TABLE repositories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        remote_url TEXT,
        github_owner TEXT,
        github_name TEXT,
        root_commit TEXT,
        status TEXT NOT NULL CHECK (status IN ('available', 'unavailable')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      INSERT INTO repositories_new
        (id, path, name, remote_url, github_owner, github_name, root_commit, status,
         created_at, last_seen_at)
      SELECT id, path, name, remote_url, github_owner, github_name, root_commit, status,
             created_at, last_seen_at
      FROM repositories;

      DROP TABLE repositories;
      ALTER TABLE repositories_new RENAME TO repositories;

      CREATE INDEX repositories_root_commit ON repositories (root_commit);
      CREATE INDEX repositories_path ON repositories (path);
      CREATE UNIQUE INDEX repositories_available_path ON repositories (path)
        WHERE status = 'available';
    `,
  },
  {
    version: 4,
    name: 'repository_settings',
    // Settings sit on the repository row. A reconnected repository keeps its row, so it
    // keeps its settings.
    sql: `
      ALTER TABLE repositories ADD COLUMN monitored INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE repositories ADD COLUMN include_drafts INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE repositories ADD COLUMN include_automated INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    version: 5,
    name: 'pull_requests',
    // Open pull requests as the last sync saw them. A pull request that closes is deleted
    // from here on the next sync.
    sql: `
      CREATE TABLE pull_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
        provider_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        draft INTEGER NOT NULL,
        url TEXT NOT NULL,
        author_login TEXT,
        author_avatar_url TEXT,
        head_branch TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (repository_id, number)
      ) STRICT;
    `,
  },
  {
    version: 6,
    name: 'pull_request_author_bot',
    // Rows from before this column read as written by a person until the next sync.
    sql: `
      ALTER TABLE pull_requests ADD COLUMN author_is_bot INTEGER NOT NULL DEFAULT 0;
    `,
  },
];
