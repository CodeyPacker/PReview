import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
  } catch (error) {
    // A damaged file fails here. Closing it lets the file be moved aside.
    db.close();
    throw error;
  }
  return db;
}

// Throws when SQLite finds damage in the database.
export function checkIntegrity(db: DatabaseSync): void {
  const rows = db.prepare('PRAGMA quick_check').all() as { quick_check: string }[];
  if (rows.length !== 1 || rows[0]?.quick_check !== 'ok') {
    throw new Error(`The database is damaged: ${rows.map((row) => row.quick_check).join('; ')}`);
  }
}

// Runs fn inside a transaction, rolling back if it throws.
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
