// SearchField: Search input with a leading magnifier and optional shortcut hint.
import { Input } from '@base-ui/react/input';
import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cx } from '../../lib/cx.ts';
import forms from '../../styles/forms.module.css';
import { Kbd } from '../Kbd/Kbd.tsx';
import styles from './SearchField.module.css';

export interface SearchFieldProps extends Omit<
  ComponentProps<typeof Input>,
  'className' | 'type' | 'size'
> {
  // lg for the global search in the window toolbar, md for list filters.
  size?: 'md' | 'lg';
  // Keys of the shortcut that focuses the field, e.g. ['⌘', 'K'].
  shortcut?: string[];
  className?: string;
}

export function SearchField({ size = 'md', shortcut, className, ...rest }: SearchFieldProps) {
  return (
    <label
      className={cx(
        forms.field,
        size === 'lg' && forms.fieldLg,
        styles.field,
        styles[size],
        className,
      )}
    >
      <Search className={styles.icon} aria-hidden />
      <Input
        {...rest}
        type="search"
        aria-label={rest['aria-label'] ?? rest.placeholder ?? 'Search'}
        className={cx(forms.input, styles.input)}
      />
      {shortcut && <Kbd keys={shortcut} />}
    </label>
  );
}
