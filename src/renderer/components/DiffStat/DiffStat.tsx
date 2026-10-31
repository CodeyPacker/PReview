// DiffStat: Lines added and removed, with an optional five-block ratio bar like GitHub's.
import { cx } from '../../lib/cx.ts';
import styles from './DiffStat.module.css';

export interface DiffStatProps {
  additions: number;
  deletions: number;
  // Adds the five-block bar that shows how the change splits between additions and deletions.
  bar?: boolean;
  className?: string;
}

const BLOCKS = 5;

// A side with any lines gets at least one block, and the two never share more than five.
function blockCounts(additions: number, deletions: number): [number, number] {
  const total = additions + deletions;
  if (total === 0) return [0, 0];
  let added = additions === 0 ? 0 : Math.max(1, Math.round((BLOCKS * additions) / total));
  let removed = deletions === 0 ? 0 : Math.max(1, Math.round((BLOCKS * deletions) / total));
  while (added + removed > BLOCKS) {
    if (added >= removed) added--;
    else removed--;
  }
  return [added, removed];
}

export function DiffStat({ additions, deletions, bar, className }: DiffStatProps) {
  const [added, removed] = blockCounts(additions, deletions);
  return (
    <span className={cx(styles.stat, className)}>
      <span className={styles.additions}>+{additions}</span>
      <span className={styles.deletions}>-{deletions}</span>
      {bar && (
        <span className={styles.bar} aria-hidden>
          {Array.from({ length: BLOCKS }, (_, index) => (
            <span
              key={index}
              className={cx(
                styles.block,
                index < added ? styles.added : index < added + removed ? styles.removed : undefined,
              )}
            />
          ))}
        </span>
      )}
    </span>
  );
}
