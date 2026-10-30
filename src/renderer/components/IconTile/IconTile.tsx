// IconTile: An icon on a tinted rounded square.
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './IconTile.module.css';

export interface IconTileProps extends HTMLAttributes<HTMLSpanElement> {
  icon: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  // solid only for the app mark or a featured reward.
  variant?: 'soft' | 'solid';
}

export function IconTile({
  icon,
  tone = 'accent',
  size = 'md',
  variant = 'soft',
  className,
  ...rest
}: IconTileProps) {
  return (
    <span
      {...rest}
      className={cx(styles.tile, styles[size], styles[variant], toneClass(tone), className)}
    >
      {icon}
    </span>
  );
}
