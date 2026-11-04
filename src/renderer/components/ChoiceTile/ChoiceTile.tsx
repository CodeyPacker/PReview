// ChoiceTile: A selectable picture with a caption: theme picker, outfits, accessories, effects, animations.
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import styles from './ChoiceTile.module.css';

export interface ChoiceTileProps {
  label?: ReactNode;
  // The media: an image, sprite frame or thumbnail. The tile doesn't crop it to a shape.
  children?: ReactNode;
  selected?: boolean;
  // Greys the media and shows a lock. A locked tile stays focusable so its hint can be read.
  locked?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  // Read by screen readers, such as the unlock hint of a locked tile.
  'aria-label'?: string;
  className?: string;
}

export function ChoiceTile({
  label,
  children,
  selected,
  locked,
  size = 'md',
  onClick,
  disabled,
  'aria-label': ariaLabel,
  className,
}: ChoiceTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        styles.tile,
        styles[size],
        selected && styles.selected,
        locked && styles.locked,
        className,
      )}
    >
      <span className={styles.media}>
        {children}
        {locked && (
          <span className={styles.lock}>
            <Lock aria-hidden />
          </span>
        )}
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}
