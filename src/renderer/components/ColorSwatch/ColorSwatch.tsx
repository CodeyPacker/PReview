// ColorSwatch: Round color choice for the accent picker in Settings › Appearance.
import { Radio } from '@base-ui/react/radio';
import styles from './ColorSwatch.module.css';

export interface ColorSwatchProps {
  // The value it gives its RadioGroup.
  value: string;
  // Any CSS color.
  color: string;
  'aria-label': string;
}

export function ColorSwatch({ value, color, 'aria-label': ariaLabel }: ColorSwatchProps) {
  return (
    <Radio.Root
      className={styles.swatch}
      style={{ background: color }}
      value={value}
      aria-label={ariaLabel}
    />
  );
}
