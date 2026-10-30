// Switch: On/off toggle that applies immediately.
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import forms from '../../styles/forms.module.css';
import styles from './Switch.module.css';

export interface SwitchProps extends Omit<ComponentProps<typeof BaseSwitch.Root>, 'className'> {
  size?: 'sm' | 'md';
  // Visible text to the right. Without it, pass aria-label or label it from a SettingRow.
  label?: ReactNode;
  className?: string;
}

export function Switch({ size = 'md', label, className, ...rest }: SwitchProps) {
  const control = (
    <BaseSwitch.Root
      {...rest}
      className={cx(styles.switch, styles[size], label == null && className)}
    >
      <BaseSwitch.Thumb className={styles.thumb} />
    </BaseSwitch.Root>
  );
  if (label == null) return control;
  return (
    <label className={cx(forms.inlineLabel, className)}>
      {control}
      {label}
    </label>
  );
}
