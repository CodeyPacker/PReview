// NavItem: Main sidebar link.
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Count } from '../Count/Count.tsx';
import styles from './NavItem.module.css';

export interface NavItemProps {
  to: LinkProps['to'];
  icon: ReactNode;
  label: string;
  // Unread or pending work. Hidden when 0.
  count?: number;
}

// Active state comes from the router: the link gets aria-current="page".
export function NavItem({ to, icon, label, count }: NavItemProps) {
  return (
    <Link to={to} className={styles.item} activeProps={{ className: styles.active }}>
      {({ isActive }) => (
        <>
          <span className={styles.icon}>{icon}</span>
          <span className={styles.label}>{label}</span>
          {count ? <Count value={count} tone={isActive ? 'accent' : 'danger'} /> : null}
        </>
      )}
    </Link>
  );
}
