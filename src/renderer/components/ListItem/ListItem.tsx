// ListItem: A row in a list: leading visual, title with eyebrow and meta, trailing actions or status.
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './ListItem.module.css';

export interface ListItemProps {
  title: ReactNode;
  // Small line above the title, e.g. the repository.
  eyebrow?: ReactNode;
  // Line below the title.
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  density?: 'sm' | 'md' | 'lg';
  // A colored stripe at the left edge. Always pair it with a word or icon.
  stripe?: Tone;
  // card gives the row its own raised ground.
  variant?: 'plain' | 'card';
  selected?: boolean;
  // Makes the row a button.
  onClick?: () => void;
  className?: string;
}

export function ListItem({
  title,
  eyebrow,
  meta,
  leading,
  trailing,
  density = 'md',
  stripe,
  variant = 'plain',
  selected,
  onClick,
  className,
}: ListItemProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={cx(
        styles.row,
        styles[density],
        variant === 'card' && styles.card,
        stripe && styles.stripe,
        stripe && toneClass(stripe),
        selected && styles.selected,
        onClick && styles.interactive,
        className,
      )}
    >
      {leading && <span className={styles.lead}>{leading}</span>}
      <span className={styles.main}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <span className={styles.title}>{title}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
      {trailing && <span className={styles.trail}>{trailing}</span>}
    </Tag>
  );
}
