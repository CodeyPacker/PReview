// Tabs: Underline tabs that switch the panel below them: PR review sections, the agent sidebar, Integrations sections, character Appearance / Animations / Details.
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import type { Option } from '../../lib/options.ts';
import { useControllableState } from '../../lib/useControllableState.ts';
import { Count } from '../Count/Count.tsx';
import styles from './Tabs.module.css';

export interface TabsProps<V extends string = string> {
  items: (Option<V> & { label: ReactNode })[];
  value?: V;
  // Defaults to the first tab.
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  size?: 'sm' | 'md';
  // Tabs share the full width equally.
  block?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  // TabPanel elements, one per item value.
  children?: ReactNode;
}

export function Tabs<V extends string = string>({
  items,
  value,
  defaultValue,
  onValueChange,
  size = 'md',
  block,
  className,
  children,
  ...aria
}: TabsProps<V>) {
  const [selected, setSelected] = useControllableState(
    value,
    // Without items there is nothing to select, so the cast only covers that empty case.
    defaultValue ?? (items[0]?.value as V),
    onValueChange,
  );
  return (
    <BaseTabs.Root
      value={selected}
      onValueChange={(next: V) => setSelected(next)}
      className={className}
    >
      <BaseTabs.List {...aria} className={cx(styles.list, styles[size], block && styles.block)}>
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={styles.tab}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <Count value={item.count} tone={item.value === selected ? 'accent' : 'neutral'} />
            )}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className={styles.indicator} />
      </BaseTabs.List>
      {children}
    </BaseTabs.Root>
  );
}

export interface TabPanelProps extends Omit<ComponentProps<typeof BaseTabs.Panel>, 'className'> {
  className?: string;
}

// The content for one tab. Pass the same value as its item.
export function TabPanel({ className, ...rest }: TabPanelProps) {
  return <BaseTabs.Panel {...rest} className={cx(styles.panel, className)} />;
}
