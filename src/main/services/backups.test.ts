import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkIntegrity, openDatabase } from '../database/connection.ts';
import { migrate } from '../database/migrate.ts';
import { migrations } from '../database/migrations.ts';
import {
  BACKUP_INTERVAL_MS,
  DatabaseBackups,
  isValidBackup,
  KEPT_BACKUPS,
  listBackups,
  applyStagedRestore,
  newestValidBackup,
  restoreBackup,
  stagedRestorePath,
  stageRestore,
} from './backups.ts';

const log = { info: () => {}, warn: () => {} };
let directory: string;
let db: DatabaseSync;
let now: Date;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'preview-backups-'));
  db = openDatabase(join(directory, 'preview.db'));
  migrate(db);
  now = new Date('2026-11-04T15:30:00.000Z');
});

afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

const backups = () =>
  new DatabaseBackups({ db, directory: join(directory, 'backups'), log, now: () => now });

describe('database backups', () => {
  it('writes a valid snapshot with the data', () => {
    db.prepare("INSERT INTO watched_folders (path, scan_depth) VALUES ('/code', 2)").run();
    const backup = backups().backUpIfDue();
    expect(backup?.createdAt).toEqual(now);
    expect(backup?.path).toMatch(/preview-20261104T153000Z\.db$/);
    expect(isValidBackup(backup!.path)).toBe(true);
    const copy = new DatabaseSync(backup!.path, { readOnly: true });
    expect(copy.prepare('SELECT path FROM watched_folders').all()).toEqual([{ path: '/code' }]);
    copy.close();
  });

  it('waits a day between snapshots', () => {
    const service = backups();
    service.backUpIfDue();
    now = new Date(now.getTime() + BACKUP_INTERVAL_MS - 1);
    expect(service.backUpIfDue()).toBeUndefined();
    now = new Date(now.getTime() + 1);
    expect(service.backUpIfDue()).toBeDefined();
    expect(listBackups(join(directory, 'backups'))).toHaveLength(2);
  });

  it('keeps only the newest week', () => {
    const service = backups();
    const start = now.getTime();
    for (let day = 0; day < KEPT_BACKUPS + 3; day++) {
      now = new Date(start + day * BACKUP_INTERVAL_MS);
      service.backUpIfDue();
    }
    const kept = listBackups(join(directory, 'backups'));
    expect(kept).toHaveLength(KEPT_BACKUPS);
    expect(kept[0]?.createdAt).toEqual(now);
    expect(readdirSync(join(directory, 'backups'))).toHaveLength(KEPT_BACKUPS);
  });

  it('ignores other files and rejects a damaged snapshot', () => {
    const folder = join(directory, 'backups');
    backups().backUp();
    writeFileSync(join(folder, 'notes.txt'), 'hi');
    writeFileSync(join(folder, 'preview-20261105T000000Z.db.partial'), 'half');
    const broken = join(folder, 'preview-20261106T000000Z.db');
    writeFileSync(broken, 'not a database');
    expect(listBackups(folder).map((backup) => backup.path)).toEqual([
      broken,
      join(folder, 'preview-20261104T153000Z.db'),
    ]);
    expect(isValidBackup(broken)).toBe(false);
  });
});

describe('restoring a backup', () => {
  it('replaces a damaged database and keeps the damaged file', () => {
    const databasePath = join(directory, 'preview.db');
    db.prepare("INSERT INTO watched_folders (path, scan_depth) VALUES ('/code', 2)").run();
    backups().backUp();
    db.close();
    writeFileSync(databasePath, 'damaged');

    const folder = join(directory, 'backups');
    writeFileSync(join(folder, 'preview-20261106T000000Z.db'), 'not a database');
    const backup = newestValidBackup(folder);
    expect(backup?.createdAt).toEqual(now);
    const aside = restoreBackup(backup!.path, databasePath, 'broken', now);

    expect(existsSync(aside)).toBe(true);
    db = openDatabase(databasePath);
    checkIntegrity(db);
    expect(db.prepare('SELECT path FROM watched_folders').all()).toEqual([{ path: '/code' }]);
  });

  it('finds nothing when no snapshot is valid', () => {
    expect(newestValidBackup(join(directory, 'backups'))).toBeUndefined();
  });
});

describe('exporting and restoring a chosen backup', () => {
  const latest = migrations.at(-1)!.version;
  const databasePath = () => join(directory, 'preview.db');

  it('exports a valid copy, replacing a file already there', () => {
    const path = join(directory, 'export.db');
    writeFileSync(path, 'old');
    backups().exportTo(path);
    expect(isValidBackup(path)).toBe(true);
    expect(existsSync(`${path}.partial`)).toBe(false);
  });

  it('puts a staged backup in place at the next start and keeps the replaced file', () => {
    const path = join(directory, 'export.db');
    db.prepare("INSERT INTO watched_folders (path, scan_depth) VALUES ('/code', 2)").run();
    backups().exportTo(path);
    db.prepare('DELETE FROM watched_folders').run();

    stageRestore(path, databasePath(), latest);
    db.close();
    const aside = applyStagedRestore(databasePath(), now);

    expect(aside).toMatch(/preview\.db\.replaced-20261104T153000Z$/);
    expect(existsSync(aside!)).toBe(true);
    expect(existsSync(stagedRestorePath(databasePath()))).toBe(false);
    db = openDatabase(databasePath());
    expect(db.prepare('SELECT path FROM watched_folders').all()).toEqual([{ path: '/code' }]);
  });

  it('does nothing at start when no backup is staged', () => {
    expect(applyStagedRestore(databasePath())).toBeUndefined();
  });

  it('refuses a file that is not a backup, or is from a newer version', () => {
    const junk = join(directory, 'junk.db');
    writeFileSync(junk, 'not a database');
    expect(() => stageRestore(junk, databasePath(), latest)).toThrow('isn’t a PReview backup');

    const path = join(directory, 'export.db');
    backups().exportTo(path);
    expect(() => stageRestore(path, databasePath(), latest - 1)).toThrow('newer version');
    expect(existsSync(stagedRestorePath(databasePath()))).toBe(false);
  });
});
