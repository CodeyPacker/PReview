// LevelTrack: Level-based unlock timeline for a character.
import { Check, Lock, Sparkles } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import styles from './LevelTrack.module.css';

export interface LevelTrackStep {
  level: number;
  label: ReactNode;
  sublabel?: ReactNode;
  // done: unlocked. current: the level the character is at. locked by default.
  state?: 'done' | 'current' | 'locked';
  icon?: ReactNode;
}

export interface LevelTrackProps {
  // Six at most.
  steps: LevelTrackStep[];
  className?: string;
}

export function LevelTrack({ steps, className }: LevelTrackProps) {
  // The rail fills up to the current step, or the last done one.
  let reached = steps.findIndex((step) => step.state === 'current');
  if (reached < 0) {
    reached = steps.map((step) => step.state).lastIndexOf('done');
  }
  const fill = steps.length > 1 ? (Math.max(reached, 0) / (steps.length - 1)) * 100 : 0;
  return (
    <div
      className={cx(styles.track, className)}
      style={{ '--cols': steps.length } as CSSProperties}
    >
      <div className={styles.rail} aria-hidden>
        <div className={styles.fill} style={{ width: `${fill}%` }} />
      </div>
      <ol className={styles.list}>
        {steps.map((step) => {
          const state = step.state ?? 'locked';
          return (
            <li key={step.level} className={cx(styles.step, styles[state])}>
              <span className={styles.node}>{step.level}</span>
              <div className={styles.card}>
                <span className={styles.icon}>
                  {state === 'locked' ? (
                    <Lock aria-hidden />
                  ) : (
                    (step.icon ?? <Sparkles aria-hidden />)
                  )}
                </span>
                {state !== 'locked' && (
                  <span className={styles.check}>
                    <Check aria-label="Unlocked" />
                  </span>
                )}
                <span className={styles.title}>{step.label}</span>
                {step.sublabel && <span className={styles.sub}>{step.sublabel}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
