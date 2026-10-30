import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './connection.ts';
import { migrations as defaultMigrations, type Migration } from './migrations.ts';

// The schema version lives in SQLite's built-in user_version header field.
function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

// Applies every migration newer than the database, each in its own transaction.
// Returns the resulting schema version.
export function migrate(
  db: DatabaseSync,
  migrations: readonly Migration[] = defaultMigrations,
): number {
  let current = schemaVersion(db);
  const latest = migrations.at(-1)?.version ?? 0;

  if (current > latest) {
    throw new Error(
      `Database schema version ${current} is newer than this app supports (${latest}). Update PReview.`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= current) continue;
    if (migration.version !== current + 1) {
      throw new Error(
        `Migration ${migration.version} is out of order; the database is at version ${current}.`,
      );
    }
    try {
      transaction(db, () => {
        db.exec(migration.sql);
        db.exec(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (error) {
      throw new Error(`Migration ${migration.version} (${migration.name}) failed.`, {
        cause: error,
      });
    }
    current = migration.version;
  }

  return current;
}
