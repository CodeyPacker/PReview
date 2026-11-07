import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { AgentTask } from '../../shared/contracts/agent-tasks.ts';
import {
  findingCategoryLabels,
  type ReviewFinding,
} from '../../shared/contracts/review-findings.ts';
import { Button } from '../components/Button/Button.tsx';
import { FindingItem } from '../components/FindingItem/FindingItem.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { AgentActivity } from './AgentActivity.tsx';
import styles from './ReviewSidePanel.module.css';

interface ReviewSidePanelProps {
  task?: AgentTask;
  agentsLoading: boolean;
  agentsError: boolean;
  findings: readonly ReviewFinding[];
  findingsLoading: boolean;
  findingsError: boolean;
  onOpenFinding: (selection: number | 'new') => void;
  className?: string;
  hidden: boolean;
}

export function ReviewSidePanel({
  task,
  agentsLoading,
  agentsError,
  findings,
  findingsLoading,
  findingsError,
  onOpenFinding,
  className,
  hidden,
}: ReviewSidePanelProps) {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const shown = findings.filter((finding) => filter === 'all' || finding.resolution === filter);
  return (
    <aside
      hidden={hidden}
      id="review-side-panel"
      aria-label="Agent and findings"
      className={className}
    >
      <Panel padding="sm" className={styles.section}>
        {agentsError && (
          <p role="alert" className={styles.message}>
            Could not load agent activity.
          </p>
        )}
        {task ? (
          <AgentActivity task={task} className={styles.agent} />
        ) : (
          <>
            <h2 className={styles.heading}>Agent Activity</h2>
            <p className={styles.message}>
              {agentsLoading
                ? 'Loading agent activity…'
                : 'No agent run for this pull request yet.'}
            </p>
          </>
        )}
      </Panel>
      <Panel
        title="Findings"
        count={findings.length}
        padding="sm"
        className={styles.section}
        action={
          <Button size="sm" iconStart={<Plus aria-hidden />} onClick={() => onOpenFinding('new')}>
            Add finding
          </Button>
        }
      >
        <ToggleGroup
          aria-label="Finding status"
          size="sm"
          options={[
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'resolved', label: 'Resolved' },
          ]}
          value={filter}
          onValueChange={setFilter}
        />
        {findingsError ? (
          <p role="alert" className={styles.message}>
            Could not load findings.
          </p>
        ) : findingsLoading ? (
          <p className={styles.message}>Loading findings…</p>
        ) : shown.length === 0 ? (
          <p className={styles.message}>
            {findings.length === 0 ? 'No findings yet.' : 'No findings match this filter.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {shown.map((finding) => (
              <li key={finding.id}>
                <FindingItem
                  compact
                  category={finding.category}
                  title={finding.description.split('\n', 1)[0]}
                  meta={`${findingCategoryLabels[finding.category]} · ${finding.publishedAt === null ? 'Not published' : 'Published'}`}
                  resolution={finding.resolution}
                  validation={finding.validation}
                  onClick={() => onOpenFinding(finding.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </aside>
  );
}
