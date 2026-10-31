// IconButton: Square icon-only button.
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Button, type ButtonProps } from '../Button/Button.tsx';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<
  ButtonProps,
  'children' | 'iconStart' | 'iconEnd' | 'block' | 'loading'
> {
  icon: ReactNode;
  // Accessible name and tooltip. Required because there is no visible text.
  label: string;
  // Red unread dot (notifications).
  dot?: boolean;
  shortcut?: string;
}

export function IconButton({ icon, label, dot, shortcut, className, ...rest }: IconButtonProps) {
  return (
    <Button
      {...rest}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      iconStart={icon}
      iconEnd={dot ? <span className={styles.dot} aria-hidden /> : undefined}
      className={cx(styles.iconButton, className)}
    />
  );
}
