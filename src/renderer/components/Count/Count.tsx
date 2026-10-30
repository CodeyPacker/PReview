// Count: Small numeric badge next to a label: nav items, tabs, panel titles, filter chips.
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './Count.module.css';

export interface CountProps {
  value: number;
  tone?: Tone;
  // Values above max show as "max+".
  max?: number;
  className?: string;
}

export function Count({ value, tone = 'neutral', max, className }: CountProps) {
  const text = max !== undefined && value > max ? `${max}+` : String(value);
  return (
    <span
      className={cx(styles.count, toneClass(tone), tone === 'accent' && styles.solid, className)}
    >
      {text}
    </span>
  );
}
