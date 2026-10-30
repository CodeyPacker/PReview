// Avatar: Person, agent or repository image with initials fallback.
import { Avatar as BaseAvatar } from '@base-ui/react/avatar';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { toneClass, type Tone } from '../../styles/tones.ts';
import styles from './Avatar.module.css';

export interface AvatarProps {
  // Accessible name, and the source of the initials fallback.
  name: string;
  src?: string;
  // Shown instead of initials when there is no image (e.g. an agent glyph).
  icon?: ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  // circle for people and agents, rounded for apps and repositories.
  shape?: 'circle' | 'rounded';
  // Fallback ground color.
  tone?: Tone;
  // Adds a presence dot in this tone.
  status?: Tone;
  className?: string;
}

function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function Avatar({
  name,
  src,
  icon,
  size = 'md',
  shape = 'circle',
  tone = 'neutral',
  status,
  className,
}: AvatarProps) {
  return (
    <BaseAvatar.Root
      role="img"
      aria-label={name}
      className={cx(
        styles.avatar,
        styles[size],
        shape === 'rounded' && styles.rounded,
        toneClass(tone),
        tone === 'accent' && styles.solid,
        className,
      )}
    >
      {src && <BaseAvatar.Image src={src} alt="" className={styles.image} />}
      <BaseAvatar.Fallback className={styles.fallback} aria-hidden>
        {icon ?? initials(name)}
      </BaseAvatar.Fallback>
      {status && <span className={cx(styles.status, toneClass(status))} aria-hidden />}
    </BaseAvatar.Root>
  );
}
