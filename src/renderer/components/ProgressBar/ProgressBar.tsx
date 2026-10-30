// ProgressBar: Linear progress for XP, agent tasks and achievement goals.
import { Progress } from '@base-ui/react/progress';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './ProgressBar.module.css';

export interface ProgressBarProps extends Omit<
  ComponentProps<typeof Progress.Root>,
  'className' | 'children'
> {
  // accent is for XP and levels. info for agent tasks, success for finished work.
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  // Visible name. Without it, pass aria-label.
  label?: ReactNode;
  // Exact numbers on the right, e.g. "1,250 / 2,000 XP".
  valueLabel?: ReactNode;
  // Shows the percentage when there is no valueLabel.
  showValue?: boolean;
  className?: string;
}

export function ProgressBar({
  tone = 'accent',
  size = 'md',
  label,
  valueLabel,
  showValue,
  className,
  ...rest
}: ProgressBarProps) {
  const value = valueLabel ?? (showValue ? <Progress.Value /> : null);
  return (
    <Progress.Root
      {...rest}
      className={cx(
        styles.progress,
        styles[size],
        toneClass(tone),
        tone === 'accent' && styles.ramp,
        className,
      )}
    >
      {(label != null || value != null) && (
        <div className={styles.meta}>
          {label != null && <Progress.Label className={styles.label}>{label}</Progress.Label>}
          {value != null && <span className={styles.value}>{value}</span>}
        </div>
      )}
      <Progress.Track className={styles.track}>
        <Progress.Indicator className={styles.fill} />
      </Progress.Track>
    </Progress.Root>
  );
}
