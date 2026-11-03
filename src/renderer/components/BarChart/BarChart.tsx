// BarChart: Stacked columns over a labelled axis: This Week on the Dashboard, activity on Stats.
import { cx } from '../../lib/cx.ts';
import styles from './BarChart.module.css';

export interface BarChartSeries {
  label: string;
  // A chart token name, e.g. "chart-2".
  color: string;
}

export interface BarChartDatum {
  label: string;
  // One value per series, stacked bottom to top.
  values: number[];
}

export interface BarChartProps {
  data: BarChartDatum[];
  // Defaults to one chart-1 series.
  series?: BarChartSeries[];
  height?: number;
  // The top of the axis. Defaults to the tallest stack.
  max?: number;
  className?: string;
}

const DEFAULT_SERIES: BarChartSeries[] = [{ label: 'Value', color: 'chart-1' }];

export function BarChart({
  data,
  series = DEFAULT_SERIES,
  height = 120,
  max,
  className,
}: BarChartProps) {
  const top = max ?? Math.max(1, ...data.map((d) => d.values.reduce((sum, v) => sum + v, 0)));
  const ticks = [0, Math.round(top / 3), Math.round((top * 2) / 3), top];
  const percent = (value: number) => `${(value / top) * 100}%`;
  return (
    <figure className={cx(styles.chart, className)}>
      <div className={styles.plot} style={{ height }}>
        <div className={styles.axis} aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: percent(tick) }}>
              {tick}
            </span>
          ))}
        </div>
        <div className={styles.grid} aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: percent(tick) }} />
          ))}
        </div>
        <div className={styles.columns}>
          {data.map((datum) => (
            <div
              key={datum.label}
              className={styles.column}
              title={`${datum.label}: ${datum.values
                .map((value, index) => `${series[index]?.label ?? 'Value'} ${value}`)
                .join(', ')}`}
            >
              <div className={styles.stack}>
                {datum.values.map((value, index) => (
                  <span
                    key={series[index]?.label ?? index}
                    style={{
                      height: percent(value),
                      background: `var(--${series[index]?.color ?? 'chart-1'})`,
                    }}
                  />
                ))}
              </div>
              <span className={styles.x}>{datum.label}</span>
            </div>
          ))}
        </div>
      </div>
      {series.length > 1 && (
        <figcaption className={styles.legend}>
          {series.map((item) => (
            <span key={item.label}>
              <span className={styles.swatch} style={{ background: `var(--${item.color})` }} />
              {item.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
