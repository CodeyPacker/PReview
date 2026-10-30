// StatusDot: Live connection or availability state: MCP server, AI agents, repositories, watched folders, agent online.
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './StatusDot.module.css';

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  // The state in words. Color alone never carries the meaning.
  label?: ReactNode;
  // A count line under the label, e.g. "12 open PRs".
  sublabel?: ReactNode;
  // Only for a process that is running right now.
  pulse?: boolean;
}

export function StatusDot({
  tone = 'success',
  label,
  sublabel,
  pulse,
  className,
  ...rest
}: StatusDotProps) {
  return (
    <span {...rest} className={cx(styles.statusDot, toneClass(tone), className)}>
      <span className={cx(styles.dot, pulse && styles.pulse)} aria-hidden />
      {(label != null || sublabel != null) && (
        <span className={styles.text}>
          {label != null && (
            <span className={cx(styles.label, tone === 'neutral' && styles.muted)}>{label}</span>
          )}
          {sublabel != null && <span className={styles.sublabel}>{sublabel}</span>}
        </span>
      )}
    </span>
  );
}
