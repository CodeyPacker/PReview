// AchievementCard: A badge in the Achievements grid or in Achievements Unlocked after a merge.
import { Lock, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import { ProgressBar } from '../ProgressBar/ProgressBar.tsx';
import { StatusPill } from '../StatusPill/StatusPill.tsx';
import { XPChip } from '../XPChip/XPChip.tsx';
import styles from './AchievementCard.module.css';

export interface AchievementCardProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  // The achievement's category color. Locked badges are always neutral.
  tone?: Tone;
  // Set when earned. Shows the date.
  earnedAt?: string;
  // Set while in progress. Shows a bar.
  progress?: { value: number; max: number };
  locked?: boolean;
  xp?: number;
  // row for the post-merge list: badge left, Unlocked pill and XP.
  layout?: 'tile' | 'row';
  className?: string;
}

export function AchievementCard({
  title,
  description,
  icon,
  tone = 'accent',
  earnedAt,
  progress,
  locked,
  xp,
  layout = 'tile',
  className,
}: AchievementCardProps) {
  const state = locked ? 'locked' : earnedAt ? 'earned' : 'progress';
  return (
    <div
      className={cx(
        styles.card,
        state === 'locked' && styles.locked,
        layout === 'row' && styles.row,
        className,
      )}
    >
      <span className={cx(styles.badge, toneClass(locked ? 'neutral' : tone))}>
        <svg viewBox="0 0 64 72" className={styles.hex} aria-hidden>
          <path d="M32 3 60 19v34L32 69 4 53V19z" />
        </svg>
        <span className={styles.glyph}>{locked ? <Lock /> : (icon ?? <Trophy />)}</span>
      </span>
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
        {state === 'earned' && (
          <span className={styles.foot}>
            {layout === 'row' ? <StatusPill status="unlocked" size="sm" /> : `Earned ${earnedAt}`}
            {xp !== undefined && <XPChip amount={xp} />}
          </span>
        )}
        {state === 'progress' && progress && (
          <ProgressBar
            value={progress.value}
            max={progress.max}
            size="sm"
            aria-label="Achievement progress"
            valueLabel={`${progress.value.toLocaleString('en-US')} / ${progress.max.toLocaleString('en-US')}`}
          />
        )}
      </div>
    </div>
  );
}
