import type { ReactNode } from 'react';

// One choice in a Select, ToggleGroup or Tabs.
export interface Option<V extends string = string> {
  value: V;
  label?: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
}

// Components take plain strings for the simple case: 'Newest' is { value: 'Newest', label: 'Newest' }.
export type OptionInput<V extends string = string> = V | Option<V>;

export function toOption<V extends string>(option: OptionInput<V>): Option<V> {
  return typeof option === 'string' ? { value: option, label: option } : option;
}
