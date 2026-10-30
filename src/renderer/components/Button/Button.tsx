// Button: Text button for every action in the app.
import { Button as BaseButton } from '@base-ui/react/button';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'tinted' | 'plain';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ComponentProps<typeof BaseButton>, 'className'> {
  // primary: the one main action in a region. outline + tone: review verdicts and
  // destructive actions. tinted: soft toggles. plain: inline links like "View All".
  variant?: ButtonVariant;
  // Colors outline, tinted and plain buttons. Primary is always the accent.
  tone?: Tone;
  size?: ButtonSize;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  // Fills the container's width.
  block?: boolean;
  // Disables the button and swaps iconStart for a spinner.
  loading?: boolean;
  // Makes it a toggle button (sets aria-pressed).
  selected?: boolean;
  className?: string;
}

export function Button({
  variant = 'secondary',
  tone = 'accent',
  size = 'md',
  iconStart,
  iconEnd,
  block,
  loading,
  selected,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <BaseButton
      {...rest}
      disabled={disabled || loading}
      focusableWhenDisabled={loading}
      aria-pressed={selected}
      aria-busy={loading || undefined}
      className={cx(
        styles.button,
        styles[variant],
        styles[size],
        toneClass(tone),
        block && styles.block,
        selected && styles.selected,
        className,
      )}
    >
      {loading ? <span className={styles.spinner} aria-hidden /> : iconStart}
      {children != null && <span className={styles.label}>{children}</span>}
      {iconEnd}
    </BaseButton>
  );
}
