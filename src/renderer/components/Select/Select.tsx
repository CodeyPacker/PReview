// Select: Dropdown for filters and settings values (All Repos, Newest, Last 30 Days, Default startup view).
import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toOption, type OptionInput } from '../../lib/options.ts';
import styles from './Select.module.css';

export interface SelectProps<V extends string = string> {
  options: OptionInput<V>[];
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  // Shown when nothing is selected.
  placeholder?: ReactNode;
  // sm in panel headers, md elsewhere.
  size?: 'sm' | 'md';
  // plain drops the border for selects that sit in a toolbar.
  variant?: 'default' | 'plain';
  iconStart?: ReactNode;
  // Fills the container's width.
  block?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

export function Select<V extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  size = 'md',
  variant = 'default',
  iconStart,
  block,
  disabled,
  name,
  id,
  className,
  ...aria
}: SelectProps<V>) {
  const items = options.map(toOption).map((item) => ({ ...item, label: item.label ?? item.value }));
  return (
    <BaseSelect.Root<V>
      items={items}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next);
      }}
      disabled={disabled}
      name={name}
      id={id}
    >
      <BaseSelect.Trigger
        {...aria}
        className={cx(
          styles.trigger,
          styles[size],
          styles[variant],
          block && styles.block,
          className,
        )}
      >
        {iconStart}
        <BaseSelect.Value className={styles.value} placeholder={placeholder} />
        <BaseSelect.Icon className={styles.chevron}>
          <ChevronDown aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className={styles.positioner} sideOffset={4}>
          <BaseSelect.Popup className={styles.popup}>
            <BaseSelect.List className={styles.list}>
              {items.map((item) => (
                <BaseSelect.Item
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                  className={styles.item}
                >
                  <span className={styles.check}>
                    <BaseSelect.ItemIndicator>
                      <Check aria-hidden />
                    </BaseSelect.ItemIndicator>
                  </span>
                  {item.icon}
                  <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
