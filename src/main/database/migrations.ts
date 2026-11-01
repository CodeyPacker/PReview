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
  {
    version: 7,
    name: 'review_drafts',
    // Comments on diff lines that have not been sent. A draft is anchored to the commits of
    // the diff it was written on. side is 'original' for the old file and 'modified' for the
    // new one. Drafts go with their pull request when it closes.
    sql: `
      CREATE TABLE review_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pull_request_id INTEGER NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
        head_sha TEXT NOT NULL,
        merge_base TEXT NOT NULL,
        path TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('original', 'modified')),
        line INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX review_drafts_pull_request ON review_drafts (pull_request_id);
    `,
  },
  {
    version: 8,
    name: 'review_draft_ranges',
    // A comment on several lines runs from start_line to line. Null for one line.
    sql: `
      ALTER TABLE review_drafts ADD COLUMN start_line INTEGER
        CHECK (start_line IS NULL OR start_line < line);
    `,
  },
  {
    version: 9,
    name: 'review_findings',
    // Problems with a pull request that aren't tied to a code line. steps is empty when there
    // are none. published_at is null until the finding goes out with a review. Findings go
    // with their pull request when it closes.
    sql: `
      CREATE TABLE review_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pull_request_id INTEGER NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
        category TEXT NOT NULL
          CHECK (category IN ('bug', 'ui-bug', 'security', 'improvement', 'test')),
        description TEXT NOT NULL,
        steps TEXT NOT NULL DEFAULT '',
        validation TEXT NOT NULL DEFAULT 'pending'
          CHECK (validation IN ('pending', 'validated', 'rejected')),
        resolution TEXT NOT NULL DEFAULT 'open' CHECK (resolution IN ('open', 'resolved')),
        published_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX review_findings_pull_request ON review_findings (pull_request_id);
    `,
  },
];
