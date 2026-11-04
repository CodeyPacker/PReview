import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../database/connection.ts';
import { migrate } from '../database/migrate.ts';
import { KEPT_NOTIFICATIONS, Notifier } from './notifications.ts';
import { updateSettings } from './settings.ts';

let db: ReturnType<typeof openDatabase>;
let show: ReturnType<typeof vi.fn<(title: string, body: string) => void>>;
let notifier: Notifier;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  show = vi.fn();
  notifier = new Notifier({ db, show });
});

describe('Notifier', () => {
  it('shows each notification and lists it newest first as unread', () => {
    notifier.notify('agent', 'An agent has a question', 'On "Add login": Which file?');
    notifier.notify('pull-request', 'New pull request', 'octo/app#3: Fix sign in');

    expect(show).toHaveBeenCalledWith('New pull request', 'octo/app#3: Fix sign in');
    const state = notifier.list();
    expect(state.unread).toBe(2);
    expect(state.notifications.map((item) => [item.kind, item.title, item.read])).toEqual([
      ['pull-request', 'New pull request', false],
      ['agent', 'An agent has a question', false],
    ]);
  });

  it('marks everything read', () => {
    notifier.notify('agent', 'CI failed', 'On "Add login": test');
    const state = notifier.markAllRead();
    expect(state.unread).toBe(0);
    expect(state.notifications[0]?.read).toBe(true);
  });

  it('lists but does not show a kind whose setting is off', () => {
    updateSettings(db, { notifyAchievements: false });
    notifier.notify(
      'achievement',
      'Achievement unlocked: First Review',
      'Finish your first review',
    );
    notifier.notify('review', 'Review sent', 'PReview sent your queued review of #7.');

    expect(show).toHaveBeenCalledExactlyOnceWith(
      'Review sent',
      'PReview sent your queued review of #7.',
    );
    expect(notifier.list().unread).toBe(2);
  });

  it('shows nothing while quiet, then shows again', () => {
    notifier.setQuiet(true);
    notifier.notify('agent', 'CI failed', 'On "Add login": test');
    expect(show).not.toHaveBeenCalled();
    expect(notifier.list().unread).toBe(1);

    notifier.setQuiet(false);
    notifier.notify('agent', 'CI failed', 'On "Add login": lint');
    expect(show).toHaveBeenCalledOnce();
  });

  it('keeps only the newest notifications', () => {
    for (let index = 0; index < KEPT_NOTIFICATIONS + 5; index++) {
      notifier.notify('agent', `Event ${index}`, '');
    }
    const { notifications } = notifier.list();
    expect(notifications).toHaveLength(KEPT_NOTIFICATIONS);
    expect(notifications[0]?.title).toBe(`Event ${KEPT_NOTIFICATIONS + 4}`);
  });
});
