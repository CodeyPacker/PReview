import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../app/PageHeader.tsx';
import { Button } from '../components/Button/Button.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { Select } from '../components/Select/Select.tsx';
import { Switch } from '../components/Switch/Switch.tsx';
import { TextField } from '../components/TextField/TextField.tsx';
import { useSettings, useUpdateSettings } from '../hooks/useSettings.ts';
import { useExportBackup, useRestoreBackup } from '../hooks/useBackups.ts';
import {
  useAppVersion,
  useCheckForUpdates,
  useInstallUpdate,
  useUpdates,
} from '../hooks/useUpdates.ts';
import type { UpdateState } from '../../shared/contracts/updates.ts';
import {
  defaultSettings,
  type ReviewLeader,
  type Settings,
} from '../../shared/contracts/settings.ts';
import { reviewShortcuts, reviewShortcutLabel } from '../lib/reviewShortcuts.ts';
import { isMac, isWindows } from '../lib/platform.ts';
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

const notificationSettings = [
  {
    key: 'notifyPullRequests',
    label: 'New pull requests',
    description: 'When a pull request needs your review.',
  },
  {
    key: 'notifyAgents',
    label: 'Agents',
    description: 'When an agent asks a question, fails, runs long, or its CI finishes.',
  },
  {
    key: 'notifyAchievements',
    label: 'Achievements',
    description: 'When you unlock an achievement.',
  },
] as const satisfies readonly { key: keyof Settings; label: string; description: string }[];

function updateStatus(state: UpdateState): string {
  switch (state.status) {
    case 'unsupported':
      return 'Development builds don’t update.';
    case 'idle':
      return 'PReview is up to date.';
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return `PReview ${state.version} is available. Download it to replace this copy.`;
    case 'downloading':
      return `Downloading PReview ${state.version}… ${Math.round(state.percent)}%`;
    case 'ready':
      return `PReview ${state.version} is ready. It installs when PReview restarts.`;
    case 'error':
      return 'Could not check for updates. Try again later.';
  }
}

function SettingsPage() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const leader = settings.data?.reviewLeader ?? defaultSettings.reviewLeader;
  const exportBackup = useExportBackup();
  const restoreBackup = useRestoreBackup();
  const exported = exportBackup.data?.status === 'exported' ? exportBackup.data.path : undefined;
  const invalidBackup =
    restoreBackup.data?.status === 'invalid' ? restoreBackup.data.message : undefined;
  const version = useAppVersion().data;
  const updates = useUpdates().data;
  const checkForUpdates = useCheckForUpdates();
  const installUpdate = useInstallUpdate();
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
      <Panel title="Notifications">
        <p className={styles.description}>
          Choose which events show desktop notifications. Every event still appears in the
          notifications list, and Zen Mode pauses desktop notifications.
        </p>
        <ul className={styles.switches}>
          {notificationSettings.map(({ key, label, description }) => (
            <li key={key}>
              <Switch
                label={
                  <span className={styles.setting}>
                    <span className="headline">{label}</span>
                    <span className={styles.description}>{description}</span>
                  </span>
                }
                checked={settings.data?.[key] ?? defaultSettings[key]}
                disabled={!settings.data}
                onCheckedChange={(checked) => update.mutate({ [key]: checked })}
              />
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Backups">
        <p className={styles.description}>
          PReview backs up its data every day and keeps the last 7 backups. Export a copy to keep
          somewhere else, or restore one. Restoring restarts PReview.
        </p>
        <div className={styles.actions}>
          <Button
            loading={exportBackup.isPending}
            disabled={restoreBackup.isPending}
            onClick={() => exportBackup.mutate()}
          >
            Export Backup…
          </Button>
          <Button
            loading={restoreBackup.isPending}
            disabled={exportBackup.isPending}
            onClick={() => restoreBackup.mutate()}
          >
            Restore Backup…
          </Button>
        </div>
        {exported && (
          <p role="status" className={styles.description}>
            Saved to {exported}
          </p>
        )}
        {(invalidBackup || exportBackup.isError || restoreBackup.isError) && (
          <p role="alert" className={styles.error}>
            {invalidBackup ??
              (exportBackup.isError
                ? 'Could not export a backup.'
                : 'Could not restore the backup.')}
          </p>
        )}
      </Panel>
      <Panel title="Updates">
        <p className={styles.description}>
          {version && `Version ${version}. `}
          {updates && updateStatus(updates)}
        </p>
        {updates && updates.status !== 'unsupported' && (
          <div className={styles.actions}>
            {updates.status === 'ready' ? (
              <Button
                variant="primary"
                loading={installUpdate.isPending}
                onClick={() => installUpdate.mutate()}
              >
                Restart to Update
              </Button>
            ) : updates.status === 'available' ? (
              <Button
                variant="primary"
                render={<a href={updates.url} target="_blank" rel="noreferrer" />}
                nativeButton={false}
              >
                Download
              </Button>
            ) : (
              <Button
                loading={checkForUpdates.isPending || updates.status === 'checking'}
                disabled={updates.status === 'downloading'}
                onClick={() => checkForUpdates.mutate()}
              >
                Check for Updates
              </Button>
            )}
          </div>
        )}
        {installUpdate.data?.status === 'busy' && (
          <p role="alert" className={styles.error}>
            An agent is running. Restart once it finishes.
          </p>
        )}
      </Panel>
      {isWindows && settings.data && (
        <Panel title="Agents">
          <TextField
            // Remounts with the saved value after each save.
            key={settings.data.wslDistro}
            label="WSL distribution"
            hint="Agents run inside this WSL distribution, which needs bubblewrap, socat and its own Claude login."
            defaultValue={settings.data.wslDistro}
            disabled={update.isPending}
            onBlur={(event) => {
              const wslDistro = event.currentTarget.value.trim();
              if (wslDistro && wslDistro !== settings.data?.wslDistro) update.mutate({ wslDistro });
            }}
          />
        </Panel>
      )}
    </div>
  );
}
