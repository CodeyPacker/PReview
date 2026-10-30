import tones from './tones.module.css';

export type Tone = 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export function toneClass(tone: Tone): string {
  return tones[tone] ?? '';
}
