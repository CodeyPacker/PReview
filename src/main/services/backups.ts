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

// A snapshot is usable when SQLite finds no damage and it has a schema.
export function isValidBackup(path: string): boolean {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const check = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    return check.length === 1 && check[0]?.integrity_check === 'ok' && user_version > 0;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

// The newest snapshot that passes its integrity check.
export function newestValidBackup(directory: string): Backup | undefined {
  return listBackups(directory).find((backup) => isValidBackup(backup.path));
}

// Replaces the database file with a snapshot. The old file and its WAL files are renamed, not
// deleted, so nothing is lost. Returns the old file's new path.
export function restoreBackup(backup: Backup, databasePath: string, now = new Date()): string {
  const aside = `${databasePath}.broken-${stamp(now)}`;
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(databasePath + suffix)) renameSync(databasePath + suffix, aside + suffix);
  }
  copyFileSync(backup.path, databasePath);
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
    // Written under another name first, so a crash midway never leaves a snapshot that looks
    // finished.
    const partial = `${path}.partial`;
    rmSync(partial, { force: true });
    this.deps.db.prepare('VACUUM INTO ?').run(partial);
    if (!isValidBackup(partial)) {
      rmSync(partial, { force: true });
      throw new Error('The new snapshot failed its integrity check.');
    }
    renameSync(partial, path);
    for (const old of listBackups(directory).slice(KEPT_BACKUPS)) rmSync(old.path, { force: true });
    this.deps.log.info('Backed up the database', path);
    return { path, createdAt: parseStamp(stamp(now)) };
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }
}
