// Panel: The container for every region of a screen.
import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Count } from '../Count/Count.tsx';
import styles from './Panel.module.css';

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'section' | 'div' | 'aside' | 'nav';
  // glass: top-level regions on the window ground. solid: where blur is off (Zen Mode).
  // raised: cards inside a panel. sunken: wells inside a panel.
  variant?: 'glass' | 'solid' | 'raised' | 'sunken';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  title?: ReactNode;
  // Heading level for the title.
  titleAs?: 'h2' | 'h3';
  icon?: ReactNode;
  count?: number;
  // Right side of the header: a "View All" button, a select, a toggle group.
  action?: ReactNode;
}

const paddingClass = {
  none: styles.padNone,
  sm: styles.padSm,
  md: styles.padMd,
  lg: styles.padLg,
};

export function Panel({
  as: Tag = 'section',
  variant = 'glass',
  padding = 'md',
  title,
  titleAs: Heading = 'h2',
  icon,
  count,
  action,
  className,
  children,
  ...rest
}: PanelProps) {
  const titleId = useId();
  return (
    <Tag
      {...rest}
      aria-labelledby={title ? titleId : rest['aria-labelledby']}
      className={cx(styles.panel, styles[variant], paddingClass[padding], className)}
    >
      {title && (
        <header className={styles.header}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <Heading id={titleId} className={styles.title}>
            {title}
          </Heading>
          {count !== undefined && <Count value={count} />}
          {action && <div className={styles.action}>{action}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}
