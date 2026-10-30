import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SCAN_DEPTH, type WatchedFolder } from '../../../shared/contracts/repositories.ts';

interface FolderRow {
  id: number;
  path: string;
  scan_depth: number;
}

export function listWatchedFolders(db: DatabaseSync): WatchedFolder[] {
  const rows = db
    .prepare('SELECT id, path, scan_depth FROM watched_folders ORDER BY path')
    .all() as unknown as FolderRow[];
  return rows.map((row) => ({ id: row.id, path: row.path, scanDepth: row.scan_depth }));
}

// Adding a folder that is already watched changes nothing.
export function addWatchedFolder(db: DatabaseSync, path: string): void {
  db.prepare('INSERT OR IGNORE INTO watched_folders (path, scan_depth) VALUES (?, ?)').run(
    path,
    DEFAULT_SCAN_DEPTH,
  );
}

export function setWatchedFolderScanDepth(db: DatabaseSync, id: number, scanDepth: number): void {
  db.prepare('UPDATE watched_folders SET scan_depth = ? WHERE id = ?').run(scanDepth, id);
}

export function removeWatchedFolder(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM watched_folders WHERE id = ?').run(id);
}
