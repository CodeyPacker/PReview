import { Bug, FileText, Lightbulb, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AchievementMetric } from '../../shared/contracts/achievements.ts';
import type { Tone } from '../styles/tones.ts';

// The icon and color of an achievement's badge, by what it counts.
export const achievementLooks: Record<AchievementMetric, { icon: ReactNode; tone: Tone }> = {
  reviews: { icon: <FileText />, tone: 'accent' },
  bugs: { icon: <Bug />, tone: 'danger' },
  improvements: { icon: <Lightbulb />, tone: 'warning' },
  streak: { icon: <Zap />, tone: 'info' },
};
