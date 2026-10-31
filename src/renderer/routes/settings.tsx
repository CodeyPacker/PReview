import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../app/PageHeader.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { Select } from '../components/Select/Select.tsx';
import { useSettings, useUpdateSettings } from '../hooks/useSettings.ts';
import { defaultSettings, type ReviewLeader } from '../../shared/contracts/settings.ts';
import { reviewShortcuts, reviewShortcutLabel } from '../lib/reviewShortcuts.ts';
import { isMac } from '../lib/platform.ts';
import styles from './settings.module.css';

export const Route = createFileRoute('/settings')({ component: SettingsPage });

const leaders: { value: ReviewLeader; label: string }[] = [
  { value: 'Control', label: 'Ctrl' },
  { value: 'Alt', label: 'Alt / Option' },
  { value: 'Meta', label: 'Command / Windows' },
  { value: 'Control+Shift', label: 'Ctrl+Shift' },
  { value: 'Alt+Shift', label: 'Alt / Option+Shift' },
  { value: 'Meta+Shift', label: 'Command / Windows+Shift' },
];

function SettingsPage() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const leader = settings.data?.reviewLeader ?? defaultSettings.reviewLeader;
  return (
    <div className={styles.page}>
      <PageHeader
        title="Settings"
        description="Customize your experience and configure how PReview works."
      />
      <Panel title="Review shortcuts">
        <div className={styles.leader}>
          <span id="review-leader-label" className="headline">
            Leader key
          </span>
          <Select
            aria-labelledby="review-leader-label"
            options={leaders}
            value={leader}
            disabled={!settings.data || update.isPending}
            onValueChange={(reviewLeader) => update.mutate({ reviewLeader })}
          />
        </div>
        <p className={styles.description}>
          Hold the leader with a letter while reviewing. J and K scroll code from anywhere on the
          review screen. Shortcuts pause while typing or using a dialog or menu.
        </p>
        <table className={styles.shortcuts} aria-label="Review keyboard shortcuts">
          <thead>
            <tr>
              <th scope="col">Shortcut</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(reviewShortcuts).map(({ key, label }) => (
              <tr key={key}>
                <td>{reviewShortcutLabel(leader, key, isMac)}</td>
                <td>{label}</td>
              </tr>
            ))}
            <tr>
              <td>J / K</td>
              <td>Scroll code down / up</td>
            </tr>
          </tbody>
        </table>
        {(settings.isError || update.isError) && (
          <p role="alert" className={styles.error}>
            Could not save or load settings. Try again.
          </p>
        )}
      </Panel>
    </div>
  );
}
