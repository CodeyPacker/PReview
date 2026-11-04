import type { DatabaseSync } from 'node:sqlite';
import type {
  AppNotification,
  NotificationKind,
  NotificationsState,
} from '../../shared/contracts/notifications.ts';
import type { Settings } from '../../shared/contracts/settings.ts';
import { getSettings } from './settings.ts';

// The in-app list keeps the newest 100.
export const KEPT_NOTIFICATIONS = 100;

// The setting that turns each kind's desktop notifications off. review has none.
const SETTING: Partial<Record<NotificationKind, keyof Settings>> = {
  'pull-request': 'notifyPullRequests',
  agent: 'notifyAgents',
  achievement: 'notifyAchievements',
};

export interface NotifierDeps {
  db: DatabaseSync;
  // Shows a desktop notification.
  show: (title: string, body: string) => void;
}

interface NotificationRow {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

// Records every notification for the in-app list and shows it on the desktop, unless its
// setting is off or the user is in Zen Mode.
export class Notifier {
  private quiet = false;

  constructor(private readonly deps: NotifierDeps) {}

  notify(kind: NotificationKind, title: string, body: string): void {
    const { db } = this.deps;
    db.prepare('INSERT INTO notification_events (kind, title, body) VALUES (?, ?, ?)').run(
      kind,
      title,
      body,
    );
    db.prepare(
      `DELETE FROM notification_events
       WHERE id NOT IN (SELECT id FROM notification_events ORDER BY id DESC LIMIT ?)`,
    ).run(KEPT_NOTIFICATIONS);
    const setting = SETTING[kind];
    if (this.quiet || (setting && !getSettings(db)[setting])) return;
    this.deps.show(title, body);
  }

  list(): NotificationsState {
    const rows = this.deps.db
      .prepare(
        'SELECT id, kind, title, body, created_at, read_at FROM notification_events ORDER BY id DESC',
      )
      .all() as unknown as NotificationRow[];
    const notifications: AppNotification[] = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
      read: row.read_at !== null,
    }));
    return {
      notifications,
      unread: notifications.filter((notification) => !notification.read).length,
    };
  }

  markAllRead(): NotificationsState {
    this.deps.db
      .prepare(
        `UPDATE notification_events SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE read_at IS NULL`,
      )
      .run();
    return this.list();
  }

  // On while the user is in Zen Mode. Notifications still go to the in-app list.
  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
  }
}
