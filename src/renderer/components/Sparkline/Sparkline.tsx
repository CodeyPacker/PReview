// Sparkline: Tiny trend line with an area fill and an endpoint dot. Decorative: the number beside it carries the meaning.
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './Sparkline.module.css';

export interface SparklineProps {
  data: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  // Draws the area under the line.
  fill?: boolean;
  className?: string;
}

const PADDING = 2;

export function Sparkline({
  data,
  tone = 'accent',
  width = 64,
  height = 28,
  fill = true,
  className,
}: SparklineProps) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const span = Math.max(...data) - min || 1;
  const points = data.map((value, index) => ({
    x: PADDING + (index / (data.length - 1)) * (width - PADDING * 2),
    y: PADDING + (1 - (value - min) / span) * (height - PADDING * 2),
  }));
  const line = points
    .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join('');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const area = `${line}L${last.x.toFixed(1)} ${height}L${first.x.toFixed(1)} ${height}Z`;
  return (
    <svg
      className={cx(styles.sparkline, toneClass(tone), className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      {fill && <path d={area} className={styles.area} />}
      <path d={line} className={styles.line} />
      <circle cx={last.x} cy={last.y} r={2.5} className={styles.end} />
    </svg>
  );
}
