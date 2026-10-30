import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../database/connection.ts';
import { migrate } from '../../database/migrate.ts';
import {
  addWatchedFolder,
  listWatchedFolders,
  removeWatchedFolder,
  setWatchedFolderScanDepth,
} from './watched-folders.ts';

let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('watched folders', () => {
  it('adds a folder with the default scan depth', () => {
    addWatchedFolder(db, '/code');
    expect(listWatchedFolders(db)).toEqual([{ id: 1, path: '/code', scanDepth: 4 }]);
  });

  it('ignores a folder that is already watched', () => {
    addWatchedFolder(db, '/code');
    setWatchedFolderScanDepth(db, 1, 2);
    addWatchedFolder(db, '/code');
    expect(listWatchedFolders(db)).toEqual([{ id: 1, path: '/code', scanDepth: 2 }]);
  });

  it('removes a folder', () => {
    addWatchedFolder(db, '/code');
    removeWatchedFolder(db, 1);
    expect(listWatchedFolders(db)).toEqual([]);
  });
});
