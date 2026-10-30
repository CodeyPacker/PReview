import type { DatabaseSync } from 'node:sqlite';
import {
  defaultSettings,
  settingsSchema,
  type Settings,
  type SettingsPatch,
} from '../../shared/contracts/settings.ts';
import { transaction } from '../database/connection.ts';

// Settings are stored one row per key with a JSON value. A stored value that no longer
// matches the schema falls back to its default.
export function getSettings(db: DatabaseSync): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const settings: Record<string, unknown> = { ...defaultSettings };
  const shape = settingsSchema.shape;

  for (const { key, value } of rows) {
    if (!Object.hasOwn(shape, key)) continue;
    let stored: unknown;
    try {
      stored = JSON.parse(value);
    } catch {
      continue;
    }
    const parsed = shape[key as keyof Settings].safeParse(stored);
    if (parsed.success) settings[key] = parsed.data;
  }

  return settings as Settings;
}

export function updateSettings(db: DatabaseSync, patch: SettingsPatch): Settings {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET
      value = excluded.value,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `);

  transaction(db, () => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) upsert.run(key, JSON.stringify(value));
    }
  });

  return getSettings(db);
}
