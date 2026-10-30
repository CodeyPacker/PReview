// Icon: Outline icon set on a 24px grid with 1.75 stroke and round caps.
import type { LucideIcon, LucideProps } from 'lucide-react';
import { cx } from '../../lib/cx.ts';
import styles from './Icon.module.css';

export type IconSize = 'sm' | 'md' | 'lg';

export interface IconProps extends Omit<LucideProps, 'ref' | 'size'> {
  // A Lucide icon component, e.g. Bug.
  icon: LucideIcon;
  // sm in pills, md in controls, lg in navigation.
  size?: IconSize;
  // Accessible name. Only for an icon that means something without visible text.
  label?: string;
}

export function Icon({ icon: LucideComponent, size = 'md', label, className, ...rest }: IconProps) {
  return (
    <LucideComponent
      strokeWidth={1.75}
      {...rest}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(styles.icon, styles[size], className)}
    />
  );
}
