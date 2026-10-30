// StatusPill: Review, PR and agent state as a tinted pill with icon.
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import { statusPresets, type Status, type StatusPreset } from './statusPresets.ts';
import styles from './StatusPill.module.css';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  // A preset. tone, icon and children override its parts.
  status?: Status;
  tone?: Tone;
  // null hides the preset's icon.
  icon?: ReactNode;
  size?: 'sm' | 'md';
  // outline for open findings that need action.
  variant?: 'soft' | 'outline';
}

export function StatusPill({
  status,
  tone,
  icon,
  size = 'md',
  variant = 'soft',
  className,
  children,
  ...rest
}: StatusPillProps) {
  const preset: StatusPreset | undefined = status && statusPresets[status];
  const PresetIcon = preset?.icon;
  return (
    <span
      {...rest}
      className={cx(
        styles.pill,
        styles[size],
        styles[variant],
        toneClass(tone ?? preset?.tone ?? 'neutral'),
        className,
      )}
    >
      {icon !== undefined ? icon : PresetIcon && <PresetIcon aria-hidden />}
      <span>{children ?? preset?.label}</span>
    </span>
  );
}
