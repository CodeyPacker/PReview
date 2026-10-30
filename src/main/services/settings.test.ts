import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../shared/contracts/settings.ts';
import { openDatabase } from '../database/connection.ts';
import { migrate } from '../database/migrate.ts';
import { getSettings, updateSettings } from './settings.ts';

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(getSettings(db)).toEqual(defaultSettings);
  });

  it('stores an update and returns the merged settings', () => {
    expect(updateSettings(db, { theme: 'dark' })).toEqual({ ...defaultSettings, theme: 'dark' });
    expect(getSettings(db)).toEqual({ ...defaultSettings, theme: 'dark' });
  });

  it('overwrites an existing value', () => {
    updateSettings(db, { theme: 'dark' });
    expect(updateSettings(db, { theme: 'light' })).toEqual({ ...defaultSettings, theme: 'light' });
  });

  it('leaves settings alone for an empty patch', () => {
    updateSettings(db, { theme: 'dark' });
    expect(updateSettings(db, {})).toEqual({ ...defaultSettings, theme: 'dark' });
  });

  it('falls back to the default for a stored value that no longer matches the schema', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('theme', '\"neon\"')").run();
    expect(getSettings(db)).toEqual(defaultSettings);
  });

  it('ignores unreadable JSON and unknown keys', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('theme', 'not json')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('retired', '1')").run();
    expect(getSettings(db)).toEqual(defaultSettings);
  });
});
