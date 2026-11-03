// Donut: Part-to-whole ring with a center total and legend: XP Breakdown, XP Earned on post-merge.
import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import styles from './Donut.module.css';

export interface DonutSegment {
  label: string;
  value: number;
  // A chart token name, e.g. "chart-2". Defaults to chart-1 to chart-5 in order.
  color?: string;
  // Legend value in place of the percent, e.g. "+250 XP".
  display?: ReactNode;
}

export interface DonutProps {
  // Five at most.
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue?: ReactNode;
  centerLabel?: ReactNode;
  legend?: boolean;
  className?: string;
}

// Space between segments, in pixels along the ring.
const GAP = 3;

function colorOf(segment: DonutSegment, index: number): string {
  return `var(--${segment.color ?? `chart-${(index % 5) + 1}`})`;
}

export function Donut({
  segments,
  size = 160,
  thickness = 18,
  centerValue,
  centerLabel,
  legend = true,
  className,
}: DonutProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const gap = segments.length > 1 ? GAP : 0;
  const arcs = segments.map((segment, index) => {
    const length = (segment.value / total) * circumference;
    const offset =
      (segments.slice(0, index).reduce((sum, { value }) => sum + value, 0) / total) * circumference;
    return (
      <circle
        key={segment.label}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={`${Math.max(length - gap, 0.01)} ${circumference}`}
        strokeDashoffset={-offset}
        style={{ stroke: colorOf(segment, index) }}
      />
    );
  });
  return (
    <div className={cx(styles.donut, className)}>
      <div className={styles.chart} style={{ '--size': `${size}px` } as CSSProperties}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            className={styles.track}
          />
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>{arcs}</g>
        </svg>
        <div className={styles.center}>
          {centerValue != null && <span className={styles.value}>{centerValue}</span>}
          {centerLabel && <span className={styles.label}>{centerLabel}</span>}
        </div>
      </div>
      {legend && (
        <ul className={styles.legend}>
          {segments.map((segment, index) => (
            <li key={segment.label} className={styles.item}>
              <span
                className={styles.swatch}
                style={{ background: colorOf(segment, index) }}
                aria-hidden
              />
              <span className={styles.itemLabel}>{segment.label}</span>
              <span className={styles.itemValue}>
                {segment.display ?? `${Math.round((segment.value / total) * 100)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
