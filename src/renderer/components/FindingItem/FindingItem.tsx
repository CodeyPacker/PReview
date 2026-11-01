// FindingItem: A finding in the review sidebar: category icon, title, meta line and its validation and open/resolved state.
import {
  AppWindow,
  Bug,
  FlaskConical,
  Lightbulb,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  findingCategoryLabels,
  type FindingCategory,
  type FindingResolution,
  type FindingValidation,
} from '../../../shared/contracts/review-findings.ts';
import { cx } from '../../lib/cx.ts';
import type { Tone } from '../../styles/tones.ts';
import { IconTile } from '../IconTile/IconTile.tsx';
import { StatusPill } from '../StatusPill/StatusPill.tsx';
import styles from './FindingItem.module.css';

const categories = {
  bug: { tone: 'danger', icon: Bug },
  'ui-bug': { tone: 'danger', icon: AppWindow },
  security: { tone: 'danger', icon: ShieldAlert },
  improvement: { tone: 'warning', icon: Lightbulb },
  test: { tone: 'info', icon: FlaskConical },
} satisfies Record<FindingCategory, { tone: Tone; icon: LucideIcon }>;

export interface FindingItemProps {
  category: FindingCategory;
  title: ReactNode;
  // Defaults to the category's name.
  meta?: ReactNode;
  resolution: FindingResolution;
  // Shown once an agent has checked the finding.
  validation?: FindingValidation;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function FindingItem({
  category,
  title,
  meta = findingCategoryLabels[category],
  resolution,
  validation = 'pending',
  selected,
  onClick,
  className,
}: FindingItemProps) {
  const { tone, icon: Icon } = categories[category];
  const resolved = resolution === 'resolved';
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      className={cx(styles.item, selected && styles.selected, className)}
      onClick={onClick}
    >
      <IconTile icon={<Icon aria-hidden />} tone={tone} size="sm" />
      <span className={styles.main}>
        <span className={styles.title}>{title}</span>
        <span className={styles.meta}>{meta}</span>
      </span>
      <span className={styles.trailing}>
        {validation !== 'pending' && <StatusPill status={validation} size="sm" />}
        <StatusPill
          status={resolved ? 'resolved' : 'unresolved'}
          size="sm"
          variant={resolved ? 'soft' : 'outline'}
        />
      </span>
    </button>
  );
}
