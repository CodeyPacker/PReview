// CharacterCard: A character in the collection grid and on the Dashboard's Your Characters strip.
import { Lock } from 'lucide-react';
import { cx } from '../../lib/cx.ts';
import styles from './CharacterCard.module.css';

export interface CharacterCardProps {
  name: string;
  level?: number;
  // Character art. Falls back to the name's initial.
  image?: string;
  // Shows a lock and the unlock hint in place of the level.
  locked?: boolean;
  unlockHint?: string;
  selected?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}

export function CharacterCard({
  name,
  level,
  image,
  locked,
  unlockHint,
  selected,
  size = 'md',
  onClick,
  className,
}: CharacterCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        styles.card,
        styles[size],
        selected && styles.selected,
        locked && styles.locked,
        className,
      )}
    >
      <span className={styles.art}>
        {image ? (
          <img src={image} alt="" className={styles.image} />
        ) : (
          <span className={styles.placeholder} aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        {locked && (
          <span className={styles.lock}>
            <Lock aria-hidden />
          </span>
        )}
      </span>
      <span className={styles.meta}>
        <span className={styles.name}>{locked ? '???' : name}</span>
        <span className={styles.level}>
          {locked ? (unlockHint ?? 'Locked') : level !== undefined && `Level ${level}`}
        </span>
      </span>
    </button>
  );
}
