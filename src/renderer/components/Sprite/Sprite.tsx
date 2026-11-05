// Sprite: Plays one animation from a sprite sheet. The parent sets its size.
import { useEffect, useEffectEvent, useRef } from 'react';
import { cx } from '../../lib/cx.ts';
import styles from './Sprite.module.css';

// SCOPE 13.4. A sheet is one row of frames, and frames lists the order to play them in.
export interface SpriteAnimation {
  name: string;
  src: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  frames: number[];
  frameDurationMs: number;
  loop: boolean;
}

export interface SpriteProps {
  // Keep this object stable. A new one starts the animation over.
  animation: SpriteAnimation;
  // Accessible name.
  label: string;
  // Called when an animation that doesn't loop has played. It holds its last frame.
  onFinished?: () => void;
  className?: string;
}

export function Sprite({ animation, label, onFinished, className }: SpriteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const finished = useEffectEvent(() => onFinished?.());

  // Frames are written straight to the element, so playing doesn't render React on every frame.
  useEffect(() => {
    const element = ref.current;
    const { frames, columns, frameDurationMs, loop } = animation;
    if (!element || frames.length === 0) return;
    const show = (frame: number) => {
      const position = columns > 1 ? (frame / (columns - 1)) * 100 : 0;
      element.style.backgroundPosition = `${position}% 0`;
      element.dataset.frame = String(frame);
    };
    // With reduced motion, show the pose the animation rests on and don't play it.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      show(loop ? frames[0]! : frames.at(-1)!);
      return;
    }
    let step = 0;
    show(frames[0]!);
    const timer = setInterval(() => {
      step += 1;
      if (step < frames.length) {
        show(frames[step]!);
      } else if (loop) {
        step = 0;
        show(frames[0]!);
      } else {
        clearInterval(timer);
        finished();
      }
    }, frameDurationMs);
    return () => clearInterval(timer);
  }, [animation]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cx(styles.sprite, className)}
      style={{
        aspectRatio: `${animation.frameWidth} / ${animation.frameHeight}`,
        backgroundImage: `url("${animation.src}")`,
        backgroundSize: `${animation.columns * 100}% 100%`,
      }}
    />
  );
}
