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
];
