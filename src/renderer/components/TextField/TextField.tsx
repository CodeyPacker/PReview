// TextField: Labeled single-line or multiline input.
import { Field } from '@base-ui/react/field';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import forms from '../../styles/forms.module.css';
import styles from './TextField.module.css';

export interface TextFieldProps extends Omit<
  ComponentProps<typeof Field.Control>,
  'className' | 'size' | 'render'
> {
  label?: ReactNode;
  // Explains the field. Replaced by error when there is one.
  hint?: ReactNode;
  // What is wrong and how to fix it. Marks the field invalid.
  error?: ReactNode;
  multiline?: boolean;
  rows?: number;
  // An affordance at the end, e.g. a folder picker. Make it a button if it is clickable.
  iconEnd?: ReactNode;
  // inline puts the label in a left column, as in Integrations › Settings.
  layout?: 'stacked' | 'inline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function TextField({
  label,
  hint,
  error,
  multiline,
  rows = 3,
  iconEnd,
  layout = 'stacked',
  size = 'md',
  disabled,
  className,
  ...rest
}: TextFieldProps) {
  return (
    <Field.Root
      invalid={error != null}
      disabled={disabled}
      className={cx(styles.textField, styles[layout], className)}
    >
      {label != null && <Field.Label className={styles.label}>{label}</Field.Label>}
      <div className={styles.body}>
        <div
          className={cx(
            forms.field,
            size === 'sm' && forms.fieldSm,
            size === 'lg' && forms.fieldLg,
            multiline && styles.multiline,
          )}
        >
          <Field.Control
            {...rest}
            render={multiline ? <textarea rows={rows} /> : undefined}
            className={cx(forms.input, multiline && styles.textarea)}
          />
          {iconEnd}
        </div>
        {error != null ? (
          <Field.Error match className={cx(styles.hint, styles.error)}>
            {error}
          </Field.Error>
        ) : (
          hint != null && <Field.Description className={styles.hint}>{hint}</Field.Description>
        )}
      </div>
    </Field.Root>
  );
}
