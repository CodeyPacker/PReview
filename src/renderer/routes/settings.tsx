import { RadioGroup } from '@base-ui/react/radio-group';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { ClearReviewDataDialog } from '../app/ClearReviewDataDialog.tsx';
import { PageHeader } from '../app/PageHeader.tsx';
import { ReviewShortcutsTable } from '../app/ReviewShortcutsTable.tsx';
import { Button } from '../components/Button/Button.tsx';
import { ColorSwatch } from '../components/ColorSwatch/ColorSwatch.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { Select } from '../components/Select/Select.tsx';
import { Switch } from '../components/Switch/Switch.tsx';
import { TextField } from '../components/TextField/TextField.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { useClearPackageCache, useSettings, useUpdateSettings } from '../hooks/useSettings.ts';
import { useExportBackup, useOpenLogs, useRestoreBackup } from '../hooks/useBackups.ts';
import {
  useAppVersion,
  useCheckForUpdates,
  useInstallUpdate,
  useUpdates,
} from '../hooks/useUpdates.ts';
import type { UpdateState } from '../../shared/contracts/updates.ts';
import {
  defaultSettings,
  type Accent,
  type AgentModel,
  type Density,
  type FontSize,
  type ReviewLeader,
  type Settings,
  type StartupScreen,
} from '../../shared/contracts/settings.ts';
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

const startupScreens: { value: StartupScreen; label: string }[] = [
  { value: 'last-review', label: 'Last review' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'inbox', label: 'Inbox' },
];

const generalSettings = [
  // Linux has no setting for this.
  ...(isMac || isWindows
    ? ([
        {
          key: 'launchAtLogin',
          label: 'Launch at login',
          description: 'Start PReview when you log in to this computer.',
        },
      ] as const)
    : []),
  {
    key: 'autoCheckUpdates',
    label: 'Check for updates automatically',
    description: 'At startup and every few hours. You can always check from Updates.',
  },
  {
    key: 'keepRunningOnClose',
    label: 'Keep running when the window closes',
    description: 'Agents keep working, and PReview stays in the system tray until you quit it.',
  },
] as const satisfies readonly { key: keyof Settings; label: string; description: string }[];

const themes: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const accents: { value: Accent; label: string; color: string }[] = [
  { value: 'purple', label: 'Purple', color: 'var(--accent-option-1)' },
  { value: 'blue', label: 'Blue', color: 'var(--accent-option-2)' },
  { value: 'teal', label: 'Teal', color: 'var(--accent-option-3)' },
  { value: 'amber', label: 'Amber', color: 'var(--accent-option-4)' },
  { value: 'coral', label: 'Coral', color: 'var(--accent-option-5)' },
  { value: 'pink', label: 'Pink', color: 'var(--accent-option-6)' },
];

const densities: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'default', label: 'Default' },
  { value: 'comfortable', label: 'Comfortable' },
];

const fontSizes: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
];

const agentLimits = ['1', '2', '3', '4', '5'];

const agentModels: { value: AgentModel; label: string }[] = [
  { value: 'default', label: 'Claude Code default' },
  { value: 'fable', label: 'Fable' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
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
  const [clearOpen, setClearOpen] = useState(false);
  const exportBackup = useExportBackup();
  const restoreBackup = useRestoreBackup();
  const openLogs = useOpenLogs();
  const clearPackageCache = useClearPackageCache();
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
      <div className={styles.columns}>
        <div className={styles.column}>
          <Panel title="General">
            <div className={styles.row}>
              <span id="startup-screen-label" className="headline">
                Startup screen
              </span>
              <Select
                aria-labelledby="startup-screen-label"
                options={startupScreens}
                value={settings.data?.startupScreen ?? defaultSettings.startupScreen}
                disabled={!settings.data}
                onValueChange={(startupScreen) => update.mutate({ startupScreen })}
              />
            </div>
            <ul className={styles.switches}>
              {generalSettings.map(({ key, label, description }) => (
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
          <Panel title="Appearance">
            <div className={styles.row}>
              <span id="theme-label" className="headline">
                Theme
              </span>
              <ToggleGroup
                aria-labelledby="theme-label"
                options={themes}
                value={settings.data?.theme ?? defaultSettings.theme}
                disabled={!settings.data}
                onValueChange={(theme) => update.mutate({ theme })}
              />
            </div>
            <div className={styles.row}>
              <span id="accent-label" className="headline">
                Accent color
              </span>
              <RadioGroup
                className={styles.swatches}
                aria-labelledby="accent-label"
                value={settings.data?.accent ?? defaultSettings.accent}
                disabled={!settings.data}
                onValueChange={(accent) => update.mutate({ accent })}
              >
                {accents.map(({ value, label, color }) => (
                  <ColorSwatch key={value} value={value} color={color} aria-label={label} />
                ))}
              </RadioGroup>
            </div>
            <div className={styles.row}>
              <span id="density-label" className="headline">
                UI density
              </span>
              <ToggleGroup
                aria-labelledby="density-label"
                options={densities}
                value={settings.data?.density ?? defaultSettings.density}
                disabled={!settings.data}
                onValueChange={(density) => update.mutate({ density })}
              />
            </div>
            <div className={styles.row}>
              <span id="font-size-label" className="headline">
                Font size
              </span>
              <ToggleGroup
                aria-labelledby="font-size-label"
                options={fontSizes}
                value={settings.data?.fontSize ?? defaultSettings.fontSize}
                disabled={!settings.data}
                onValueChange={(fontSize) => update.mutate({ fontSize })}
              />
            </div>
            <div className={styles.row}>
              <span id="diff-font-size-label" className="headline">
                Diff font size
              </span>
              <ToggleGroup
                aria-labelledby="diff-font-size-label"
                options={fontSizes}
                value={settings.data?.diffFontSize ?? defaultSettings.diffFontSize}
                disabled={!settings.data}
                onValueChange={(diffFontSize) => update.mutate({ diffFontSize })}
              />
            </div>
            <Switch
              label={<span className="headline">Wrap long lines in diffs</span>}
              checked={settings.data?.diffWordWrap ?? defaultSettings.diffWordWrap}
              disabled={!settings.data}
              onCheckedChange={(diffWordWrap) => update.mutate({ diffWordWrap })}
            />
          </Panel>
          <Panel title="Review shortcuts">
            <div className={styles.row}>
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
              Hold the leader with a letter while reviewing. Click a shortcut to change its letter.
              J and K scroll code from anywhere on the review screen. Shortcuts pause while typing
              or using a dialog or menu.
            </p>
            <ReviewShortcutsTable
              leader={leader}
              keys={settings.data?.reviewKeys ?? defaultSettings.reviewKeys}
              mac={isMac}
              disabled={!settings.data || update.isPending}
              onChange={(reviewKeys) => update.mutate({ reviewKeys })}
            />
            {(settings.isError || update.isError) && (
              <p role="alert" className={styles.error}>
                Could not save or load settings. Try again.
              </p>
            )}
          </Panel>
          <Panel title="Changed files">
            <Switch
              label={
                <span className={styles.setting}>
                  <span className="headline">Group tests and generated files</span>
                  <span className={styles.description}>
                    Tests, stories and generated files go in a collapsed group at the bottom of
                    every changed files list.
                  </span>
                </span>
              }
              checked={settings.data?.groupSupportFiles ?? defaultSettings.groupSupportFiles}
              disabled={!settings.data}
              onCheckedChange={(groupSupportFiles) => update.mutate({ groupSupportFiles })}
            />
          </Panel>
          <Panel title="Agents">
            <div className={styles.row}>
              <span id="agent-limit-label" className="headline">
                Agents at once
              </span>
              <ToggleGroup
                aria-labelledby="agent-limit-label"
                options={agentLimits}
                value={String(settings.data?.agentLimit ?? defaultSettings.agentLimit)}
                disabled={!settings.data}
                onValueChange={(limit) => update.mutate({ agentLimit: Number(limit) })}
              />
            </div>
            <div className={styles.row}>
              <span id="agent-model-label" className="headline">
                Default model
              </span>
              <Select
                aria-labelledby="agent-model-label"
                options={agentModels}
                value={settings.data?.agentModel ?? defaultSettings.agentModel}
                disabled={!settings.data}
                onValueChange={(agentModel) => update.mutate({ agentModel })}
              />
            </div>
            <p className={styles.description}>
              Other agents wait in the queue. A new model applies the next time an agent starts.
            </p>
            {isWindows && settings.data && (
              <TextField
                // Remounts with the saved value after each save.
                key={settings.data.wslDistro}
                label="WSL distribution"
                hint="Agents run inside this WSL distribution, which needs bubblewrap, socat and its own Claude login."
                defaultValue={settings.data.wslDistro}
                disabled={update.isPending}
                onBlur={(event) => {
                  const wslDistro = event.currentTarget.value.trim();
                  if (wslDistro && wslDistro !== settings.data?.wslDistro)
                    update.mutate({ wslDistro });
                }}
              />
            )}
            <p className={styles.description}>
              Downloaded packages are shared between agent runs. Clearing them frees disk space. The
              next install downloads them again.
              {isWindows && ' This clears the selected WSL distribution’s cache.'}
            </p>
            <div className={styles.actions}>
              <Button
                loading={clearPackageCache.isPending}
                onClick={() => clearPackageCache.mutate()}
              >
                Clear Package Cache
              </Button>
            </div>
            {clearPackageCache.data?.status === 'cleared' && (
              <p role="status" className={styles.description}>
                Package cache cleared.
              </p>
            )}
            {clearPackageCache.data?.status === 'busy' && (
              <p role="alert" className={styles.error}>
                An agent or cache cleanup is active. Try again when it finishes.
              </p>
            )}
            {clearPackageCache.isError && (
              <p role="alert" className={styles.error}>
                Could not clear the package cache. Try again.
              </p>
            )}
          </Panel>
        </div>
        <div className={styles.column}>
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
              PReview backs up its data every day and keeps the last 7 backups. Export a copy to
              keep somewhere else, or restore one. Restoring restarts PReview.
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
          <Panel title="Privacy & Data">
            <p className={styles.description}>
              Delete the unsent comments, findings, screenshots and agent history stored on this
              computer.
            </p>
            <div className={styles.actions}>
              <Button variant="outline" tone="danger" onClick={() => setClearOpen(true)}>
                Delete Review Data…
              </Button>
            </div>
            <ClearReviewDataDialog open={clearOpen} onOpenChange={setClearOpen} />
          </Panel>
          <Panel title="Troubleshooting">
            <p className={styles.description}>
              Logs record what PReview did and any errors, with tokens and other secrets removed.
              They stay on this computer unless you share them.
            </p>
            <div className={styles.actions}>
              <Button loading={openLogs.isPending} onClick={() => openLogs.mutate()}>
                Open Logs
              </Button>
            </div>
            {openLogs.isError && (
              <p role="alert" className={styles.error}>
                Could not open the logs folder.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
