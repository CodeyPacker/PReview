import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.ts';
import { migrate } from './migrate.ts';
import { migrations } from './migrations.ts';

function userVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined
  );
}

describe('migrate', () => {
  it('applies every migration to a new database', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db)).toBe(migrations.at(-1)?.version);
    expect(tableExists(db, 'settings')).toBe(true);
  });

  it('does nothing when the database is current', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    expect(migrate(db)).toBe(userVersion(db));
  });

  it('rolls back a failed migration and keeps earlier ones', () => {
    const db = openDatabase(':memory:');
    const list = [
      { version: 1, name: 'first', sql: 'CREATE TABLE a (x)' },
      { version: 2, name: 'broken', sql: 'CREATE TABLE b (x); NOT SQL' },
    ];
    expect(() => migrate(db, list)).toThrow('Migration 2 (broken) failed.');
    expect(userVersion(db)).toBe(1);
    expect(tableExists(db, 'a')).toBe(true);
    expect(tableExists(db, 'b')).toBe(false);
  });

  it('refuses a database newer than the app', () => {
    const db = openDatabase(':memory:');
    db.exec('PRAGMA user_version = 99');
    expect(() => migrate(db)).toThrow('newer than this app supports');
  });

  it('refuses a gap in migration versions', () => {
    const db = openDatabase(':memory:');
    expect(() => migrate(db, [{ version: 2, name: 'gap', sql: '' }])).toThrow('out of order');
  });

  it('numbers shipped migrations 1, 2, 3 without gaps', () => {
    expect(migrations.map((m) => m.version)).toEqual(migrations.map((_, i) => i + 1));
  });
});
