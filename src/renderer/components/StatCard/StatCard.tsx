// StatCard: A single review metric with icon, value, change and trend.
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import type { Tone } from '../../styles/tones.ts';
import { IconTile } from '../IconTile/IconTile.tsx';
import { Sparkline } from '../Sparkline/Sparkline.tsx';
import styles from './StatCard.module.css';

export interface StatCardProps {
  label: ReactNode;
  value: number | string;
  // Percent change. Negative values flip the arrow and turn red.
  delta?: number;
  // By meaning: bugs danger, improvements warning, comments info, approvals success, PRs and files accent.
  tone?: Tone;
  icon?: ReactNode;
  // Trend values for the sparkline. Hidden in the stacked layout.
  data?: number[];
  // stacked for the compact Key Stats grid.
  layout?: 'inline' | 'stacked';
  className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  tone = 'accent',
  icon,
  data,
  layout = 'inline',
  className,
}: StatCardProps) {
  const down = delta !== undefined && delta < 0;
  const Arrow = down ? ArrowDown : ArrowUp;
  return (
    <div className={cx(styles.card, layout === 'stacked' && styles.stacked, className)}>
      {icon && <IconTile icon={icon} tone={tone} size={layout === 'stacked' ? 'md' : 'lg'} />}
      <div className={styles.body}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>
          {typeof value === 'number' ? value.toLocaleString('en-US') : value}
        </span>
        {delta !== undefined && (
          <span className={cx(styles.delta, down ? styles.down : styles.up)}>
            <Arrow aria-hidden />
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {data && layout === 'inline' && (
        <Sparkline data={data} tone={tone} className={styles.trend} />
      )}
    </div>
  );
}
