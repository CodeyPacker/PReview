// Tag: Label without state: PR labels, comment topics, repository kind (Personal, Work, Local), PR number.
import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './Tag.module.css';

export interface TagProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  // neutral by default. info or accent only to match GitHub label groups.
  tone?: Tone;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  // Makes the tag a filter button.
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

export function Tag({
  tone = 'neutral',
  size = 'md',
  icon,
  onClick,
  className,
  children,
  ...rest
}: TagProps) {
  const classes = cx(styles.tag, styles[size], toneClass(tone), className);
  if (onClick) {
    return (
      <button {...rest} type="button" onClick={onClick} className={classes}>
        {icon}
        {children}
      </button>
    );
  }
  return (
    <span {...rest} className={classes}>
      {icon}
      {children}
    </span>
  );
}
