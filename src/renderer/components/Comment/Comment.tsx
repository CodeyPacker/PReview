// Comment: An inline review comment in the diff, or a discussion reply.
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Avatar } from '../Avatar/Avatar.tsx';
import styles from './Comment.module.css';

export interface CommentProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  author: string;
  // Replaces the author's initials, e.g. an Avatar with their image.
  avatar?: ReactNode;
  time?: ReactNode;
  // State shown at the end of the header, e.g. a Draft pill.
  status?: ReactNode;
  // Actions at the end of the footer.
  actions?: ReactNode;
}

// The body is shown as plain text, so untrusted text can't inject markup.
export function Comment({
  author,
  avatar,
  time,
  status,
  actions,
  className,
  children,
  ...rest
}: CommentProps) {
  return (
    <article {...rest} className={cx(styles.comment, className)}>
      {avatar ?? <Avatar name={author} size="md" />}
      <div className={styles.body}>
        <header className={styles.head}>
          <span className={styles.author}>{author}</span>
          {time != null && <span className={styles.time}>{time}</span>}
          {status != null && <span className={styles.status}>{status}</span>}
        </header>
        <div className={styles.text}>{children}</div>
        {actions != null && <footer className={styles.foot}>{actions}</footer>}
      </div>
    </article>
  );
}
