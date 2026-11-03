// XPChip: Experience points earned or pending. Plain text in findings, a chip in headers.
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './XPChip.module.css';

export interface XPChipProps {
  amount: number;
  // text inside findings and comments. chip in the comment composer and review header.
  variant?: 'text' | 'chip';
  // success for earned XP by default. warning for zero or pending amounts.
  tone?: Tone;
  size?: 'md' | 'lg';
  icon?: ReactNode;
  className?: string;
}

export function XPChip({
  amount,
  variant = 'text',
  tone,
  size = 'md',
  icon,
  className,
}: XPChipProps) {
  const sign = amount > 0 ? '+' : '';
  return (
    <span
      className={cx(
        styles.xp,
        toneClass(tone ?? (amount > 0 ? 'success' : 'warning')),
        variant === 'chip' && styles.chip,
        size === 'lg' && styles.lg,
        className,
      )}
    >
      {icon}
      {sign}
      {amount.toLocaleString('en-US')} XP
    </span>
  );
}
