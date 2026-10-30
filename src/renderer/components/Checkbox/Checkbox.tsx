// Checkbox: Multi-select option or a file-reviewed mark.
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Check, Minus } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import forms from '../../styles/forms.module.css';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<ComponentProps<typeof BaseCheckbox.Root>, 'className'> {
  // Visible text to the right, e.g. "Viewed" in the diff header. Without it, pass aria-label.
  label?: ReactNode;
  className?: string;
}

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  const control = (
    <BaseCheckbox.Root {...rest} className={cx(styles.box, label == null && className)}>
      <BaseCheckbox.Indicator className={styles.indicator}>
        {rest.indeterminate ? <Minus aria-hidden /> : <Check aria-hidden />}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
  if (label == null) return control;
  return (
    <label className={cx(forms.inlineLabel, className)}>
      {control}
      {label}
    </label>
  );
}
