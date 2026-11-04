import { Popover } from '@base-ui/react/popover';
import { Bell } from 'lucide-react';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { useMarkNotificationsRead, useNotifications } from '../hooks/useNotifications.ts';
import styles from './NotificationsButton.module.css';
import { relativeTime } from './relativeTime.ts';

// The bell in the sidebar. A dot shows unread notifications, and opening the list marks
// them read.
export function NotificationsButton() {
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = data?.unread ?? 0;
  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open && unread > 0) markRead.mutate();
      }}
    >
      <Popover.Trigger
        render={
          <IconButton
            icon={<Bell />}
            label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            size="lg"
            dot={unread > 0}
          />
        }
      />
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="right" align="end" sideOffset={8}>
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={`headline ${styles.title}`}>Notifications</Popover.Title>
            {data && data.notifications.length > 0 ? (
              <ul className={styles.list}>
                {data.notifications.map((notification) => (
                  <li key={notification.id} className={styles.item}>
                    <span className="headline">{notification.title}</span>
                    <span className={styles.body}>{notification.body}</span>
                    <time className={styles.time} dateTime={notification.createdAt}>
                      {relativeTime(notification.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.body}>No notifications yet.</p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
