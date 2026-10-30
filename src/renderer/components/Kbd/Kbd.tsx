// Kbd: Keyboard shortcut hint.
import { cx } from '../../lib/cx.ts';
import styles from './Kbd.module.css';

export interface KbdProps {
  keys: string[];
  className?: string;
}

export function Kbd({ keys, className }: KbdProps) {
  return (
    <span className={cx(styles.kbd, className)}>
      {keys.map((key) => (
        <kbd key={key} className={styles.key}>
          {key}
        </kbd>
      ))}
    </span>
  );
}
