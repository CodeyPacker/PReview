import { cx } from '../../lib/cx.ts';
import styles from './ActiveItemIndicator.module.css';

// Pair with useActiveItemRect on the positioned parent. Consumers supply the color and radius.
export function ActiveItemIndicator({
  as: Tag = 'span',
  className,
}: {
  as?: 'span' | 'li';
  className?: string;
}) {
  return <Tag aria-hidden data-active-indicator className={cx(styles.indicator, className)} />;
}
