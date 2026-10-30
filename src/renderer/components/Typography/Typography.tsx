// Typography: Text in the design system's type scale. Ported from Pigmentory.
import { createElement, type ComponentPropsWithRef } from 'react';
import { cx } from '../../lib/cx.ts';
import styles from './Typography.module.css';

type TextElement =
  | 'p'
  | 'span'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'label'
  | 'legend'
  | 'strong'
  | 'small'
  | 'dt'
  | 'dd';

type TypographyOptions<T extends TextElement> = {
  /** The HTML element to render. */
  tag?: T;
  /** Apply this element's default styling without changing the rendered tag. */
  as?: TextElement;
  /** Font size. Line height and letter spacing follow the size. */
  size?: 'xs' | 'sm' | 'md' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  color?: 'inherit' | 'primary' | 'secondary' | 'inverse' | 'accent';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  font?: 'sans' | 'display' | 'mono';
};

export type TypographyProps<T extends TextElement = 'p'> = TypographyOptions<T> &
  Omit<ComponentPropsWithRef<T>, keyof TypographyOptions<T>>;

const elementStyles: Partial<Record<TextElement, TypographyOptions<TextElement>>> = {
  h1: { size: '3xl', weight: 'bold', font: 'display' },
  h2: { size: 'xl', weight: 'semibold', font: 'display' },
  h3: { size: 'lg', weight: 'semibold' },
  h4: { size: 'base', weight: 'semibold' },
  h5: { size: 'md', weight: 'semibold' },
  h6: { size: 'sm', weight: 'medium' },
  strong: { weight: 'semibold' },
  small: { size: 'sm' },
};

/** `tag` selects the HTML element. `as` selects its styling. Explicit style props win. */
export function Typography<T extends TextElement = 'p'>({
  tag,
  as,
  size,
  color,
  weight,
  font,
  className,
  ...props
}: TypographyProps<T>) {
  const defaults = elementStyles[as ?? tag ?? 'p'];
  return createElement(tag ?? 'p', {
    ...props,
    className: cx(styles.text, className),
    'data-size': size ?? defaults?.size,
    'data-color': color ?? defaults?.color,
    'data-weight': weight ?? defaults?.weight,
    'data-font': font ?? defaults?.font,
  });
}
