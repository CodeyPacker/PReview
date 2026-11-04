import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// A new snapshot once a day, keeping the last week.
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const KEPT_BACKUPS = 7;
// How often a running app checks whether a snapshot is due.
const CHECK_MS = 60 * 60 * 1000;

const NAME = /^preview-(\d{8}T\d{6}Z)\.db$/;

export interface Backup {
  path: string;
  createdAt: Date;
}

export interface DatabaseBackupsDeps {
  db: DatabaseSync;
  directory: string;
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void };
  now?: () => Date;
}

// 20261104T153000Z, which sorts in time order and is safe in a file name.
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

function parseStamp(text: string): Date {
  const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(text)!;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
}

// The snapshots in a folder, newest first.
export function listBackups(directory: string): Backup[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  return names
    .flatMap((name) => {
      const match = NAME.exec(name);
      return match ? [{ path: join(directory, name), createdAt: parseStamp(match[1]!) }] : [];
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// The snapshot's schema version when SQLite finds no damage in it, or undefined when it's
// damaged, has no schema or isn't a database.
export function backupSchemaVersion(path: string): number | undefined {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const check = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    return check.length === 1 && check[0]?.integrity_check === 'ok' && user_version > 0
      ? user_version
      : undefined;
  } catch {
    return undefined;
  } finally {
    db?.close();
  }
}

// A snapshot is usable when SQLite finds no damage and it has a schema.
export const isValidBackup = (path: string) => backupSchemaVersion(path) !== undefined;

// The newest snapshot that passes its integrity check.
export function newestValidBackup(directory: string): Backup | undefined {
  return listBackups(directory).find((backup) => isValidBackup(backup.path));
}

// Replaces the database file with a snapshot. The old file and its WAL files are renamed with
// the reason, not deleted, so nothing is lost. Returns the old file's new path.
export function restoreBackup(
  sourcePath: string,
  databasePath: string,
  reason: 'broken' | 'replaced',
  now = new Date(),
): string {
  const aside = `${databasePath}.${reason}-${stamp(now)}`;
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(databasePath + suffix)) renameSync(databasePath + suffix, aside + suffix);
  }
  copyFileSync(sourcePath, databasePath);
  return aside;
}

// A backup the user chose waits here until the next start, since the open database can't be
// replaced.
export const stagedRestorePath = (databasePath: string) => `${databasePath}.restore`;

// Copies a backup the user chose to put in place at the next start. Throws with a message
// safe to show when it can't be used.
export function stageRestore(sourcePath: string, databasePath: string, latestVersion: number) {
  const version = backupSchemaVersion(sourcePath);
  if (version === undefined) {
    throw new Error('This file isn’t a PReview backup, or it’s damaged.');
  }
  if (version > latestVersion) {
    throw new Error('This backup is from a newer version of PReview. Update PReview first.');
  }
  copyFileSync(sourcePath, stagedRestorePath(databasePath));
}

// Puts a staged backup in place. Call at startup, before the database opens. Returns the
// replaced file's new path, or undefined when nothing was staged.
export function applyStagedRestore(databasePath: string, now = new Date()): string | undefined {
  const staged = stagedRestorePath(databasePath);
  if (!existsSync(staged)) return undefined;
  const aside = restoreBackup(staged, databasePath, 'replaced', now);
  rmSync(staged);
  return aside;
}

// Copies the database to a local folder once a day. Each copy is a consistent snapshot, checked
// before it's kept. Older copies past the last week are deleted.
export class DatabaseBackups {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: DatabaseBackupsDeps) {}

  // Backs up now if a snapshot is due, then checks every hour.
  start(): void {
    this.backUpIfDue();
    this.timer = setInterval(() => this.backUpIfDue(), CHECK_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  // Returns the new snapshot, or undefined when the newest one is less than a day old or the
  // backup failed.
  backUpIfDue(): Backup | undefined {
    const now = this.now();
    const newest = listBackups(this.deps.directory)[0];
    if (newest && now.getTime() - newest.createdAt.getTime() < BACKUP_INTERVAL_MS) return;
    try {
      return this.backUp(now);
    } catch (error) {
      this.deps.log.warn('Could not back up the database', error);
      return undefined;
    }
  }

  backUp(now = this.now()): Backup {
    const { directory } = this.deps;
    mkdirSync(directory, { recursive: true });
    const path = join(directory, `preview-${stamp(now)}.db`);
    this.snapshot(path);
    for (const old of listBackups(directory).slice(KEPT_BACKUPS)) rmSync(old.path, { force: true });
    this.deps.log.info('Backed up the database', path);
    return { path, createdAt: parseStamp(stamp(now)) };
  }

  // Writes a snapshot to a path the user chose.
  exportTo(path: string): void {
    this.snapshot(path);
  }

  // Written under another name first, so a crash midway never leaves a snapshot that looks
  // finished. VACUUM INTO refuses to overwrite, so an existing file is replaced at the end.
  private snapshot(path: string): void {
    const partial = `${path}.partial`;
    rmSync(partial, { force: true });
    this.deps.db.prepare('VACUUM INTO ?').run(partial);
    if (!isValidBackup(partial)) {
      rmSync(partial, { force: true });
      throw new Error('The new snapshot failed its integrity check.');
    }
    renameSync(partial, path);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }
}
