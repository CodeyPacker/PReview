// ActivityItem: One entry in the agent activity feed: status updates, tool runs, test outcomes and messages PReview sent on the user's behalf.
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import styles from './ActivityItem.module.css';

export interface ActivityItemProps {
  author: string;
  // Shown as written. dateTime is the machine-readable time behind it.
  time: string;
  dateTime?: string;
  avatar?: ReactNode;
  // For what the user sent through PReview, such as an answer to an agent.
  highlighted?: boolean;
  // The final entry, where the rail stops.
  last?: boolean;
  children: ReactNode;
  className?: string;
}

// Render inside an <ol>.
export function ActivityItem({
  author,
  time,
  dateTime,
  avatar,
  highlighted,
  last,
  children,
  className,
}: ActivityItemProps) {
  return (
    <li
      className={cx(styles.item, highlighted && styles.highlighted, last && styles.last, className)}
    >
      <span className={styles.rail} aria-hidden>
        <span className={styles.node} />
      </span>
      <div className={styles.card}>
        {avatar}
        <div className={styles.body}>
          <div className={styles.head}>
            <span className={styles.author}>{author}</span>
            <time dateTime={dateTime}>{time}</time>
          </div>
          <div className={styles.text}>{children}</div>
        </div>
      </div>
    </li>
  );
}
