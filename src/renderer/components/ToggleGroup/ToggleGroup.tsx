// ToggleGroup: One choice from a short, fixed set, shown all at once.
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { useRef } from 'react';
import { cx } from '../../lib/cx.ts';
import { toOption, type OptionInput } from '../../lib/options.ts';
import { useActiveItemRect } from '../../lib/useActiveItemRect.ts';
import { useControllableState } from '../../lib/useControllableState.ts';
import { Count } from '../Count/Count.tsx';
import styles from './ToggleGroup.module.css';

export interface ToggleGroupProps<V extends string = string> {
  options: OptionInput<V>[];
  value?: V;
  // Defaults to the first option.
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  // track: mode toggles in toolbars. chips: filters and settings with room to breathe.
  // pills: small filters inside a panel header.
  variant?: 'track' | 'chips' | 'pills';
  size?: 'sm' | 'md';
  // Fills the container's width with equal segments.
  block?: boolean;
  disabled?: boolean;
  name?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

export function ToggleGroup<V extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  variant = 'track',
  size = 'md',
  block,
  disabled,
  name,
  className,
  ...aria
}: ToggleGroupProps<V>) {
  const items = options.map(toOption);
  const [selected, setSelected] = useControllableState(
    value,
    // Without items there is nothing to select, so the cast only covers that empty case.
    defaultValue ?? (items[0]?.value as V),
    onValueChange,
  );
  const groupRef = useRef<HTMLDivElement>(null);
  useActiveItemRect(groupRef, ':scope > [data-checked]', selected);
  return (
    <RadioGroup<V>
      {...aria}
      ref={groupRef}
      value={selected}
      onValueChange={setSelected}
      disabled={disabled}
      name={name}
      className={cx(styles.group, styles[variant], styles[size], block && styles.block, className)}
    >
      {/* The selected background. It slides to the checked item in track and pills. */}
      <span aria-hidden className={styles.indicator} />
      {items.map((item) => (
        <Radio.Root
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          className={styles.item}
        >
          {item.icon}
          {item.label != null && <span>{item.label}</span>}
          {item.count !== undefined && (
            <Count value={item.count} tone={item.value === selected ? 'accent' : 'neutral'} />
          )}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
