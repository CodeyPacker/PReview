import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  changedFile,
  changedLine,
  mockFileReviewMarks,
  mockIpc,
  mockReReview,
  openReview,
  pullRequestsState,
} from './mocks.ts';

// Each test gets its own user-data folder, so it starts with an empty database.
let userDataDir: string;

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'preview-e2e-'));
});

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

// The windows stay hidden so the tests don't flash on screen. Set SHOW_E2E_WINDOW=1 to watch.
// CI shows them, because a hidden window can't take focus there and it has no screen to flash.
function launch(): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      PREVIEW_HIDE_WINDOW: process.env.SHOW_E2E_WINDOW || process.env.CI ? '0' : '1',
    },
  });
}

// A fresh user-data folder has no GitHub connection, so the connect prompt opens first.
async function dismissGitHubPrompt(page: Page): Promise<void> {
  await page
    .getByRole('dialog', { name: 'Connect GitHub' })
    .getByRole('button', { name: 'Not now' })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

// Opens the Finish Review menu in the review header and picks an action.
async function finishReviewWith(page: Page, action: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Finish Review' }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

test('launches the app window', async () => {
  const app = await launch();
  const page = await app.firstWindow();

  await expect(page).toHaveTitle('PReview');
  expect(await page.evaluate(() => typeof (window as { require?: unknown }).require)).toBe(
    'undefined',
  );

  await app.close();
});

test('applies the appearance settings', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click();
    const root = page.locator('html');

    await page.getByRole('radio', { name: 'Teal' }).click();
    await expect(root).toHaveAttribute('data-accent', 'teal');
    await page.getByRole('radio', { name: 'Compact' }).click();
    await expect(root).toHaveAttribute('data-density', 'compact');
    await page
      .getByRole('radiogroup', { name: 'Font size', exact: true })
      .getByRole('radio', { name: 'Large' })
      .click();
    await expect(root).toHaveAttribute('data-font-size', 'large');
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(root).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('radio', { name: 'Purple' }).click();
    await expect(root).not.toHaveAttribute('data-accent');
  } finally {
    await app.close();
  }
});

test('saves the agent settings', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click();

    await page.getByRole('radio', { name: '4', exact: true }).click();
    await page.getByRole('combobox', { name: 'Default model' }).click();
    await page.getByRole('option', { name: 'Sonnet' }).click();

    await expect
      .poll(() => page.evaluate(() => window.preview.settings.getAll()))
      .toMatchObject({ agentLimit: 4, agentModel: 'sonnet' });
  } finally {
    await app.close();
  }
});

test('deletes review data from Settings after asking', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click();
    const open = page.getByRole('button', { name: 'Delete Review Data…' });
    const dialog = page.getByRole('dialog', { name: 'Delete review data?' });
    const confirm = dialog.getByRole('button', { name: 'Delete Review Data' });

    await open.click();
    await confirm.click();
    await expect(dialog).toBeHidden();

    await mockIpc(app, { 'reviewData.clear': { status: 'busy' } });
    await open.click();
    await confirm.click();
    await expect(dialog.getByRole('alert')).toContainText('An agent is working');
  } finally {
    await app.close();
  }
});

test('opens the startup screen chosen in Settings', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click();
    await page.getByRole('combobox', { name: 'Startup screen' }).click();
    await page.getByRole('option', { name: 'Inbox' }).click();
    await expect
      .poll(() => page.evaluate(() => window.preview.settings.getAll()))
      .toMatchObject({ startupScreen: 'inbox' });

    await page.evaluate(() => {
      location.hash = '/';
    });
    await page.reload();
    await expect(page).toHaveURL(/#\/inbox$/);
  } finally {
    await app.close();
  }
});

test('opens the logs folder from Settings', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    // Records the folder instead of opening it on the screen of whoever runs this test.
    await app.evaluate(({ shell }) => {
      shell.openPath = (path) => {
        (globalThis as { openedPath?: string }).openedPath = path;
        return Promise.resolve('');
      };
    });
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click();
    await page.getByRole('button', { name: 'Open Logs' }).click();

    await expect
      .poll(() => app.evaluate(() => (globalThis as { openedPath?: string }).openedPath))
      .toMatch(/logs/i);
    await expect(page.getByRole('alert')).toBeHidden();
  } finally {
    await app.close();
  }
});

test('keeps a saved setting after a restart', async () => {
  let app = await launch();
  let page = await app.firstWindow();
  expect(await page.evaluate(() => window.preview.settings.getAll())).toEqual({
    startupScreen: 'last-review',
    launchAtLogin: false,
    autoCheckUpdates: true,
    keepRunningOnClose: true,
    theme: 'system',
    accent: 'purple',
    density: 'default',
    fontSize: 'default',
    diffFontSize: 'default',
    diffWordWrap: false,
    githubPromptDismissed: false,
    reviewLeader: 'Control',
    reviewKeys: {
      approve: 'a',
      flag: 'f',
      comment: 'i',
      tree: 't',
      next: 'n',
      previous: 'p',
      zen: 'z',
      sidebar: 'b',
    },
    wslDistro: 'Ubuntu',
    agentLimit: 2,
    agentModel: 'default',
    groupSupportFiles: true,
    notifyPullRequests: true,
    notifyAgents: true,
    notifyAchievements: true,
  });
  await page.evaluate(() => window.preview.settings.update({ theme: 'dark' }));
  await app.close();

  app = await launch();
  page = await app.firstWindow();
  expect(await page.evaluate(() => window.preview.settings.getAll())).toEqual({
    startupScreen: 'last-review',
    launchAtLogin: false,
    autoCheckUpdates: true,
    keepRunningOnClose: true,
    theme: 'dark',
    accent: 'purple',
    density: 'default',
    fontSize: 'default',
    diffFontSize: 'default',
    diffWordWrap: false,
    githubPromptDismissed: false,
    reviewLeader: 'Control',
    reviewKeys: {
      approve: 'a',
      flag: 'f',
      comment: 'i',
      tree: 't',
      next: 'n',
      previous: 'p',
      zen: 'z',
      sidebar: 'b',
    },
    wslDistro: 'Ubuntu',
    agentLimit: 2,
    agentModel: 'default',
    groupSupportFiles: true,
    notifyPullRequests: true,
    notifyAgents: true,
    notifyAchievements: true,
  });
  await app.close();
});

test('rejects an invalid setting', async () => {
  const app = await launch();
  const page = await app.firstWindow();

  await expect(
    page.evaluate(() =>
      window.preview.settings.update({ theme: 'neon' } as unknown as { theme: 'dark' }),
    ),
  ).rejects.toThrow('settings.update: invalid input');
  expect(await page.evaluate(() => window.preview.settings.getAll())).toEqual({
    startupScreen: 'last-review',
    launchAtLogin: false,
    autoCheckUpdates: true,
    keepRunningOnClose: true,
    theme: 'system',
    accent: 'purple',
    density: 'default',
    fontSize: 'default',
    diffFontSize: 'default',
    diffWordWrap: false,
    githubPromptDismissed: false,
    reviewLeader: 'Control',
    reviewKeys: {
      approve: 'a',
      flag: 'f',
      comment: 'i',
      tree: 't',
      next: 'n',
      previous: 'p',
      zen: 'z',
      sidebar: 'b',
    },
    wslDistro: 'Ubuntu',
    agentLimit: 2,
    agentModel: 'default',
    groupSupportFiles: true,
    notifyPullRequests: true,
    notifyAgents: true,
    notifyAchievements: true,
  });

  await app.close();
});

test('turns desktop notifications off by kind and opens the notifications list', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await dismissGitHubPrompt(page);

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  const achievements = page.getByRole('switch', { name: /^Achievements/ });
  await expect(achievements).toBeChecked();
  await achievements.click();
  await expect(achievements).not.toBeChecked();
  expect(await page.evaluate(() => window.preview.settings.getAll())).toMatchObject({
    notifyPullRequests: true,
    notifyAchievements: false,
  });

  await page.getByRole('button', { name: 'Notifications' }).click();
  const list = page.getByRole('dialog', { name: 'Notifications' });
  await expect(list).toContainText('No notifications yet.');
  await page.screenshot({ path: test.info().outputPath('notifications.png') });

  await app.close();
});

test('shows where updates stand and restarts only when no agent is running', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click();
    const panel = page.getByRole('region', { name: 'Updates' });
    await expect(panel.getByText('Development builds don’t update.')).toBeVisible();
    await expect(panel.getByRole('button')).toHaveCount(0);

    // The panel reads the state every few seconds, so these show without a reload.
    await mockIpc(app, {
      'updates.get': { status: 'downloading', version: '1.2.0', percent: 41.6 },
    });
    await expect(panel.getByText('Downloading PReview 1.2.0… 42%')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Check for Updates' })).toBeDisabled();

    await mockIpc(app, {
      'updates.get': { status: 'ready', version: '1.2.0' },
      'updates.install': { status: 'busy' },
    });
    await panel.getByRole('button', { name: 'Restart to Update' }).click();
    await expect(panel.getByRole('alert')).toHaveText(
      'An agent is running. Restart once it finishes.',
    );

    // Where PReview can't install an update, it links to the download.
    await mockIpc(app, {
      'updates.get': {
        status: 'available',
        version: '1.2.0',
        url: 'https://github.com/CodeyPacker/PReview/releases/tag/v1.2.0',
      },
    });
    await expect(panel.getByRole('button', { name: 'Download' })).toHaveAttribute(
      'href',
      'https://github.com/CodeyPacker/PReview/releases/tag/v1.2.0',
    );
  } finally {
    await app.close();
  }
});

test('exports a backup and refuses a file that is not one', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await dismissGitHubPrompt(page);
  const exportPath = join(userDataDir, 'exported.db');
  const junkPath = join(userDataDir, 'junk.db');
  writeFileSync(junkPath, 'not a database');
  // The system file dialogs can't be driven, so they answer with these files.
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: paths.save });
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [paths.open] });
    },
    { save: exportPath, open: junkPath },
  );

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('button', { name: 'Export Backup…' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved to' })).toHaveText(
    `Saved to ${exportPath}`,
  );
  expect(existsSync(exportPath)).toBe(true);

  await page.getByRole('button', { name: 'Restore Backup…' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'This file isn’t a PReview backup, or it’s damaged.',
  );
  await page.screenshot({ path: test.info().outputPath('backups.png') });

  await app.close();
});

test('restores a chosen backup when it restarts', async () => {
  let app = await launch();
  let page = await app.firstWindow();
  await dismissGitHubPrompt(page);
  const backupPath = join(userDataDir, 'chosen.db');
  await app.evaluate(({ app, dialog }, path) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
    // The test starts the app again itself.
    app.relaunch = () => {};
  }, backupPath);
  const settings = page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
    name: 'Settings',
  });
  await settings.click();
  await page.getByRole('button', { name: 'Export Backup…' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved to' })).toBeVisible();
  // A change made after the backup is lost when it's restored.
  await page.evaluate(() => window.preview.settings.update({ theme: 'dark' }));

  const closed = app.waitForEvent('close');
  await page.getByRole('button', { name: 'Restore Backup…' }).click();
  await closed;

  app = await launch();
  page = await app.firstWindow();
  try {
    expect(await page.evaluate(() => window.preview.settings.getAll())).toMatchObject({
      theme: 'system',
      githubPromptDismissed: true,
    });
  } finally {
    await app.close();
  }
});

test('reloads the window after a crash, and asks before reloading a second time', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await app.evaluate(({ dialog }) => {
      const asked: string[] = [];
      Object.assign(globalThis, { crashPrompts: asked });
      // The box takes a window only when one is visible, so its options come last.
      dialog.showMessageBoxSync = (...args: unknown[]) => {
        asked.push((args.at(-1) as { message: string }).message);
        return 0;
      };
    });
    const crash = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer(),
      );
    const crashPrompts = () =>
      app.evaluate(() => (globalThis as { crashPrompts?: string[] }).crashPrompts);
    // Playwright loses the page when it crashes, so the main process reads the reloaded one:
    // its heading, and whether a dialog is open.
    const shown = () =>
      app.evaluate(({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0]?.webContents;
        if (!contents || contents.isCrashed() || contents.isLoading()) return null;
        // A read that lands while the page reloads fails, and the poll tries again.
        return contents
          .executeJavaScript(
            `({ heading: document.querySelector('h2')?.textContent, dialog: !!document.querySelector('[role=dialog]') })`,
          )
          .catch(() => null) as Promise<{ heading?: string; dialog: boolean } | null>;
      });
    // The dismissed GitHub prompt was saved, so it stays closed.
    const dashboard = { heading: 'Your Progress', dialog: false };

    await crash();
    await expect.poll(shown).toEqual(dashboard);
    expect(await crashPrompts()).toEqual([]);

    await crash();
    await expect.poll(crashPrompts).toEqual(['PReview keeps crashing']);
    await expect.poll(shown).toEqual(dashboard);
  } finally {
    await app.close();
  }
});

test('opens on the dashboard and navigates from the sidebar', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await dismissGitHubPrompt(page);
  const nav = page.getByRole('navigation', { name: 'Main' });

  await expect(page.getByRole('heading', { level: 2, name: 'Pending Reviews' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('link', { name: 'Inbox' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page');
  expect(new URL(page.url()).hash).toBe('#/inbox');

  for (const name of ['Characters', 'Achievements', 'Integrations', 'Settings']) {
    await nav.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }

  await app.close();
});

test('applies the saved theme to the window', async () => {
  let app = await launch();
  let page = await app.firstWindow();
  await dismissGitHubPrompt(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Pending Reviews' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
  await page.evaluate(() => window.preview.settings.update({ theme: 'dark' }));
  await app.close();

  app = await launch();
  page = await app.firstWindow();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await app.close();
});

test('prompts to connect GitHub until the prompt is dismissed', async () => {
  let app = await launch();
  let page = await app.firstWindow();
  const dialog = page.getByRole('dialog', { name: 'Connect GitHub' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Connect GitHub' })).toBeVisible();
  expect(await page.evaluate(() => window.preview.github.getAuth())).toEqual({ accounts: [] });
  await dismissGitHubPrompt(page);
  await app.close();

  app = await launch();
  page = await app.firstWindow();
  await expect(page.getByRole('heading', { level: 2, name: 'Pending Reviews' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Integrations' }).click();
  await expect(page.getByText('Not connected')).toBeVisible();
  await page.getByRole('button', { name: 'Connect GitHub' }).click();
  await expect(page.getByRole('dialog', { name: 'Connect GitHub' })).toBeVisible();
  await app.close();
});

// Makes a Git repository with an origin remote under root and returns its real path.
function createRepository(root: string, name: string): string {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
      cwd: path,
    });
  git('init', '-q');
  git('remote', 'add', 'origin', `git@github.com:octo/${name}.git`);
  git('commit', '-q', '--allow-empty', '-m', 'first');
  return realpathSync(path);
}

test('discovers repositories in a watched folder', async () => {
  const code = realpathSync(mkdtempSync(join(tmpdir(), 'preview-e2e-code-')));
  try {
    const hello = createRepository(join(code, 'work'), 'hello');
    const app = await launch();
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Integrations' })
      .click();
    await expect(page.getByText('No folders yet')).toBeVisible();

    // The native picker can't be driven, so the main process answers it with the folder.
    await app.evaluate(({ dialog }, folder) => {
      (dialog as { showOpenDialog: unknown }).showOpenDialog = () =>
        Promise.resolve({ canceled: false, filePaths: [folder] });
    }, code);
    await page.getByRole('button', { name: 'Add Folder…' }).click();

    await expect(page.getByText(code, { exact: true })).toBeVisible();
    const list = page.getByRole('region', { name: 'Repositories' });
    await expect(list.getByText('octo/hello')).toBeVisible();
    await expect(list.getByText(hello, { exact: true })).toBeVisible();
    await expect(page.getByText('Available', { exact: true })).toBeVisible();
    await expect(page.getByText('Monitoring', { exact: true })).toBeVisible();

    const monitor = page.getByRole('switch', { name: /Monitor pull requests/ });
    await expect(monitor).toBeChecked();
    await monitor.focus();
    await page.keyboard.press('Space');
    await expect(monitor).not.toBeChecked();
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: /Include drafts/ })).toBeChecked();

    await page.getByRole('button', { name: `Remove ${code}` }).click();
    await expect(page.getByText('No folders yet')).toBeVisible();
    await expect(page.getByRole('button', { name: /octo\/hello.*Unavailable/ })).toBeVisible();
    await app.close();
  } finally {
    rmSync(code, { recursive: true, force: true });
  }
});

test('shows the Inbox empty state until GitHub is connected', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await dismissGitHubPrompt(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Inbox' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  await expect(page.getByText('Connect GitHub on the Integrations page')).toBeVisible();
  await app.close();
});

test('starts with one character and every badge unearned', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    const nav = page.getByRole('navigation', { name: 'Main' });

    await nav.getByRole('link', { name: 'Characters' }).click();
    await expect(page.getByRole('button', { name: 'Your Companion' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Shadow/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const animation = page.getByRole('radiogroup', { name: 'Animation' });
    await expect(page.getByRole('img', { name: 'Shadow' })).toBeVisible();
    await animation.getByRole('radio', { name: 'Victory' }).click();
    // Victory plays once, then Shadow goes back to idle.
    await expect(animation.getByRole('radio', { name: 'Idle' })).toBeChecked();
    const weapon = page.getByRole('group', { name: 'Weapon' });
    await expect(weapon.getByRole('button', { name: 'Dagger', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      weapon.getByRole('button', { name: 'Void Crescent, unlocks at level 2' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Unlocks at Account Level 3/ }).click();
    await expect(page.getByText('Unlocks at Account Level 3.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set as Companion' })).toBeDisabled();

    await nav.getByRole('link', { name: 'Achievements' }).click();
    await expect(page.getByText('Finish a review this week to start a streak.')).toBeVisible();
    const badges = page.getByRole('radiogroup', { name: 'Show badges' });
    await expect(badges.getByRole('radio', { name: 'Earned 0' })).toBeVisible();
    await badges.getByRole('radio', { name: /^Earned/ }).click();
    await expect(page.getByText('No badges here yet.')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('celebrates a merged pull request and picks a new companion', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    // Shadow earned the pull request's XP, which reached Account Level 3 and unlocked Ember
    // and the First Bug Caught badge.
    await app.evaluate(({ ipcMain }) => {
      const level = (xp: number, perLevel: number) => ({
        xp,
        level: Math.floor(xp / perLevel) + 1,
        levelXp: xp % perLevel,
        nextLevelXp: perLevel,
      });
      const character = (id: string, name: string, unlockLevel: number, xp: number) => ({
        ...level(xp, 500),
        id,
        name,
        title: 'Placeholder',
        unlockLevel,
        unlocked: unlockLevel <= 3,
        outfit: 'default',
        weapon: id === 'ember' ? 'crystal-scepter' : 'dagger',
      });
      const progression = {
        account: level(2150, 1000),
        streak: { current: 1, longest: 1, thisWeek: true },
        activeCharacter: 'shadow',
        characters: [
          character('shadow', 'Shadow', 1, 1200),
          character('ember', 'Ember', 3, 0),
          character('frost', 'Frost', 6, 0),
          character('bolt', 'Bolt', 10, 0),
        ],
      };
      const award = (id: number, reason: string, category: string | null, amount: number) => ({
        id,
        reason,
        baseXp: amount,
        multiplier: 1,
        amount,
        activeMs: 0,
        pullRequestId: 1,
        repository: 'octo/app',
        number: 7,
        findingId: category ? id : null,
        commentId: null,
        category,
        characterId: 'shadow',
        createdAt: '2026-11-02T12:00:00.000Z',
      });
      const handlers: Record<string, (input: never) => unknown> = {
        'mergedPullRequests.get': () => ({
          pullRequestId: 1,
          repository: 'octo/app',
          number: 7,
          url: 'https://github.com/octo/app/pull/7',
          mergedAt: '2026-11-02T12:05:00.000Z',
          comments: 2,
          suggestions: 0,
          bugsCaught: 1,
          filesReviewed: 3,
        }),
        'progression.listXp': () => [
          award(1, 'review-completed', null, 20),
          award(2, 'finding-resolved', 'bug', 50),
        ],
        'progression.get': () => progression,
        'progression.setActiveCharacter': ({ characterId }: { characterId: string }) => {
          progression.activeCharacter = characterId;
          return progression;
        },
        'achievements.list': () => [
          {
            id: 'first-bug',
            name: 'First Bug Caught',
            description: 'Catch your first bug.',
            metric: 'bugs',
            target: 1,
            progress: 1,
            earnedAt: '2026-11-02T12:00:01.000Z',
          },
        ],
      };
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });
    await page.evaluate(() => {
      location.hash = '/post-merge/1';
    });
    await page.reload();

    await expect(page.getByText('octo/app')).toBeVisible();
    await expect(page.getByText('#7')).toBeVisible();
    // The total, and the same XP for the account and the character.
    await expect(page.getByText('+70', { exact: true })).toBeVisible();
    await expect(page.getByText('+70 XP')).toHaveCount(2);
    await expect(page.getByText('+50 XP')).toBeVisible();
    await expect(page.getByText('+20 XP')).toBeVisible();
    await expect(page.getByText('First Bug Caught')).toBeVisible();
    // The account and Shadow are both at level 3.
    await expect(page.getByText('Level 3', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('progressbar', { name: 'Account level progress' })).toHaveAttribute(
      'aria-valuenow',
      '150',
    );
    // The character's bar is named by its visible level.
    await expect(page.getByRole('progressbar', { name: 'Level 3' })).toHaveAttribute(
      'aria-valuenow',
      '200',
    );
    await page.screenshot({ path: test.info().outputPath('post-merge.png') });

    // Ember unlocked at Account Level 3, so it can be the companion now.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Characters' })
      .click();
    await page.getByRole('button', { name: /^Ember/ }).click();
    await page.getByRole('button', { name: 'Set as Companion' }).click();
    await expect(page.getByRole('button', { name: 'Your Companion' })).toBeDisabled();
  } finally {
    await app.close();
  }
});

test('applies the diff font size and word wrap settings', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    const long = `const a = '${'x'.repeat(2000)}';\n`;
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Diff settings'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts')],
      },
      'pullRequestFiles.getDiff': {
        original: long,
        modified: `${long}// End\n`,
        unavailable: null,
      },
    });
    await page.evaluate(() =>
      window.preview.settings.update({ diffFontSize: 'large', diffWordWrap: true }),
    );
    await openReview(app, page);

    const rows = page.locator('.editor.modified .view-line');
    await expect(rows.first()).toBeVisible();
    await expect(page.locator('.editor.modified .view-lines')).toHaveCSS('font-size', '15px');
    // Monaco draws each wrapped row as its own line, and the file only has two lines.
    await expect.poll(() => rows.count()).toBeGreaterThan(3);
  } finally {
    await app.close();
  }
});

test('keeps split view at window size and toggles review panels independently', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Review layout') });
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1100, 800);
      const responses: Record<string, unknown> = {
        'pullRequestFiles.list': {
          headSha: 'abcdef1',
          mergeBase: 'abcdef0',
          files: [
            {
              path: 'a.ts',
              blobSha: 'sha-a.ts',
              previousPath: null,
              status: 'modified',
              additions: 1,
              deletions: 1,
              hunks: null,
            },
            {
              path: 'new.ts',
              blobSha: 'sha-new.ts',
              previousPath: null,
              status: 'added',
              additions: 1,
              deletions: 0,
              hunks: null,
            },
          ],
        },
        'pullRequestFiles.getDiff': {
          original: '// Context\nconst a = 1;\n// End\n',
          modified: '// Context\nconst a = 2;\n// End\n',
          unavailable: null,
        },
      };
      for (const [channel, response] of Object.entries(responses)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input: { path?: string } | undefined) =>
          channel === 'pullRequestFiles.getDiff' && input?.path === 'new.ts'
            ? { original: '', modified: 'export const added = true;\n', unavailable: null }
            : response,
        );
      }
    });
    await openReview(app, page);
    await expect(page.getByRole('heading', { name: 'Repository #7' })).toBeVisible();
    const files = page.locator('#review-files');
    const nav = page.locator('#main-sidebar');
    const original = page.locator('.original-in-monaco-diff-editor');
    const modified = page.locator('.modified-in-monaco-diff-editor');
    // A review opens with both panels expanded.
    await expect(nav).toBeVisible();
    await expect(files).toBeVisible();
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await page.getByRole('button', { name: 'Collapse changed files' }).click();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
    await expect(files).toBeHidden();
    await expect
      .poll(async () => {
        const tab = await page.getByRole('button', { name: 'Expand changed files' }).boundingBox();
        const panel = await page.getByRole('region', { name: 'a.ts', exact: true }).boundingBox();
        // Closed, the tab is attached to the inside of the review panel.
        return !!tab && !!panel && tab.x >= panel.x && tab.x + tab.width <= panel.x + 40;
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const before = await original.boundingBox();
        const after = await modified.boundingBox();
        return (
          !!before &&
          !!after &&
          before.width > 100 &&
          after.width > 100 &&
          after.x >= before.x + before.width - 1
        );
      })
      .toBe(true);

    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await expect(nav).toBeVisible();
    // Open, the navigation tab is inside the sidebar, at its right edge.
    await expect
      .poll(async () => {
        const tab = await page.getByRole('button', { name: 'Collapse navigation' }).boundingBox();
        const sidebar = await nav.boundingBox();
        return (
          !!tab &&
          !!sidebar &&
          tab.x > sidebar.x &&
          tab.x + tab.width <= sidebar.x + sidebar.width + 1 &&
          tab.x + tab.width >= sidebar.x + sidebar.width - 4
        );
      })
      .toBe(true);
    // A sibling tab cannot exclude a native drag region covering the whole sidebar.
    expect(
      await nav.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region')),
    ).not.toBe('drag');
    await page.screenshot({ path: test.info().outputPath('navigation-expanded.png') });
    await expect(files).toBeHidden();
    await page.getByRole('button', { name: 'Expand changed files' }).click();
    await expect(files).toBeVisible();
    // Open, the files tab is inside the files panel, at its right edge.
    await expect
      .poll(async () => {
        const tab = await page
          .getByRole('button', { name: 'Collapse changed files' })
          .boundingBox();
        const panel = await files.boundingBox();
        return (
          !!tab &&
          !!panel &&
          tab.x > panel.x &&
          tab.x + tab.width <= panel.x + panel.width + 1 &&
          tab.x + tab.width >= panel.x + panel.width - 4
        );
      })
      .toBe(true);
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(nav).toBeHidden();
    await expect
      .poll(
        async () =>
          (await page.getByRole('button', { name: 'Expand navigation' }).boundingBox())?.x,
      )
      .toBe(0);
    await page.screenshot({ path: test.info().outputPath('navigation-collapsed.png') });
    await expect(files).toBeVisible();

    await page.getByRole('radio', { name: 'Unified', exact: true }).click();
    await expect(nav).toBeVisible();
    await expect(files).toBeVisible();
    await expect
      .poll(async () => (await original.locator('.line-numbers').allTextContents()).filter(Boolean))
      .toEqual(['2']);
    await expect
      .poll(async () => (await modified.locator('.line-numbers').allTextContents()).filter(Boolean))
      .toEqual(['1', '2', '3', '4']);
    expect(
      await page.evaluate(async () => {
        const fonts = await document.fonts.load('16px codicon');
        return fonts.length > 0 && fonts.every((font) => font.status === 'loaded');
      }),
    ).toBe(true);
    await expect(modified.locator('.line-numbers').first()).toBeVisible();

    await page.getByRole('radio', { name: 'Split', exact: true }).click();
    await expect(nav).toBeHidden();
    await expect(files).toBeHidden();
    await expect(original.locator('.line-numbers').first()).toBeVisible();
    await page.getByRole('button', { name: 'Expand changed files' }).click();
    await files.getByRole('button', { name: /new.ts/ }).click();
    const fileIndicator = files.locator('ul > [data-active-indicator]');
    await expect
      .poll(() =>
        fileIndicator.evaluate((el) =>
          el
            .getAnimations()
            .some(
              (animation) =>
                animation instanceof CSSTransition && animation.transitionProperty === 'translate',
            ),
        ),
      )
      .toBe(true);
    const indicatorAlignment = async () => {
      const highlight = await fileIndicator.boundingBox();
      const row = await files.locator('button[aria-current="true"]').boundingBox();
      return highlight && row
        ? Math.abs(highlight.y - row.y) + Math.abs(highlight.height - row.height)
        : 999;
    };
    await expect.poll(indicatorAlignment).toBeLessThan(1);
    // The highlight follows the selected row in scroll content coordinates.
    await files.locator('ul').evaluate((el) => {
      el.style.maxHeight = '36px';
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(indicatorAlignment).toBeLessThan(1);
    await files.locator('ul').evaluate((el) => {
      el.style.removeProperty('max-height');
      el.scrollTop = 0;
    });
    const split = page.getByRole('radio', { name: 'Split', exact: true });
    const unified = page.getByRole('radio', { name: 'Unified', exact: true });
    await expect(unified).toBeChecked();
    await expect(split).toBeDisabled();
    await expect
      .poll(() => original.evaluate((el) => el.getBoundingClientRect().width))
      .toBeLessThan(10);
    await expect(modified).toContainText('export const added');
    await files.getByRole('button', { name: /a.ts/ }).click();
    await expect(split).toBeChecked();
    await expect(split).toBeEnabled();
    await expect
      .poll(() => original.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(100);

    // The heading stays aligned, and the open tab is inside the files panel.
    await expect
      .poll(async () => {
        const heading = await page.locator('#review-file-title').boundingBox();
        const numberX = await original
          .locator('.line-numbers')
          .first()
          .evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getBoundingClientRect().x;
          });
        return Math.abs((heading?.x ?? 0) - numberX);
      })
      .toBeLessThan(1);
    await expect
      .poll(async () => {
        const tab = await page
          .getByRole('button', { name: 'Collapse changed files' })
          .boundingBox();
        const panel = await files.boundingBox();
        return (
          !!tab && !!panel && tab.x > panel.x && tab.x + tab.width <= panel.x + panel.width + 1
        );
      })
      .toBe(true);
    await expect.poll(indicatorAlignment).toBeLessThan(1);
    await page.screenshot({ path: test.info().outputPath('review-header.png') });

    await unified.click();
    await files.getByRole('button', { name: /new.ts/ }).click();
    await expect(unified).toBeChecked();
    await files.getByRole('button', { name: /a.ts/ }).click();
    await expect(unified).toBeChecked();
    const title = page.locator('#review-file-title');
    const previousFile = page.getByRole('button', { name: 'Previous file', exact: true });
    const nextFile = page.getByRole('button', { name: 'Next file', exact: true });
    const approve = page.getByRole('button', { name: 'Approve file', exact: true });
    const removeApproval = page.getByRole('button', { name: 'Remove file approval', exact: true });
    const flag = page.getByRole('button', { name: 'Flag file', exact: true });
    const removeFlag = page.getByRole('button', { name: 'Remove file flag', exact: true });
    const filterFiles = async (name: string) => {
      await files.getByRole('button', { name: /^Filter files/ }).click();
      await page.getByRole('menuitemradio', { name, exact: true }).click();
    };
    const noFilter = files.getByRole('button', { name: 'Filter files', exact: true });
    const aRow = files.getByRole('button', { name: /a.ts/ });
    const newRow = files.getByTitle('new.ts', { exact: true });
    await expect(previousFile).toBeDisabled();
    await expect(noFilter).toBeVisible();
    await approve.click();
    await expect(title).toHaveText('new.ts');
    await expect(aRow).toHaveAttribute('data-review-state', 'approved');
    await expect(nextFile).toBeDisabled();
    await flag.click();
    await expect(title).toHaveText('new.ts');
    await expect(removeFlag).toHaveAttribute('aria-pressed', 'true');
    await expect(newRow).toHaveAttribute('data-review-state', 'flagged');
    await expect.poll(indicatorAlignment).toBeLessThan(1);
    await page.screenshot({ path: test.info().outputPath('subtle-file-statuses.png') });
    // The header shows the current file state even without the tree.
    await page.getByRole('button', { name: 'Collapse changed files' }).click();
    await expect(files).toBeHidden();
    await expect(removeFlag.locator('svg')).not.toHaveCSS('fill', 'none');
    await expect(approve).toHaveAttribute('aria-pressed', 'false');
    await page.screenshot({ path: test.info().outputPath('active-file-flag.png') });
    await approve.click();
    await expect(title).toHaveText('new.ts');
    await expect(newRow).toHaveAttribute('data-review-state', 'approved');
    await expect(removeApproval).toHaveAttribute('aria-pressed', 'true');
    await expect(flag).toHaveAttribute('aria-pressed', 'false');
    await expect(flag.locator('svg')).toHaveCSS('fill', 'none');
    await page.screenshot({ path: test.info().outputPath('active-file-approval.png') });
    await flag.click();
    await expect(newRow).toHaveAttribute('data-review-state', 'flagged');
    await expect(approve).toHaveAttribute('aria-pressed', 'false');
    await expect(removeFlag).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Expand changed files' }).click();

    await previousFile.click();
    await expect(removeApproval).toHaveAttribute('aria-pressed', 'true');
    await flag.click();
    await expect(title).toHaveText('new.ts');
    await expect(aRow).not.toHaveAttribute('data-review-state', 'approved');
    await expect(aRow).toHaveAttribute('data-review-state', 'flagged');

    await filterFiles('Flagged');
    await expect(files.getByRole('button', { name: 'Filter files: Flagged' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(aRow).toBeVisible();
    await expect(newRow).toBeVisible();
    await aRow.click();
    await approve.click();
    await expect(title).toHaveText('new.ts');
    await expect(aRow).toHaveCount(0);
    await expect(newRow).toBeVisible();
    await expect(previousFile).toBeDisabled();
    await expect(nextFile).toBeDisabled();
    await filterFiles('Unapproved');
    await expect(aRow).toHaveCount(0);
    await expect(newRow).toBeVisible();
    await approve.click();
    await expect(files.getByText('No files match this filter.')).toBeVisible();
    await expect(approve).toBeDisabled();
    await expect(flag).toBeDisabled();
    await filterFiles('All');
    await expect(aRow).toHaveAttribute('data-review-state', 'approved');
    await expect(newRow).toHaveAttribute('data-review-state', 'approved');
    await previousFile.click();
    await removeApproval.click();
    await expect(title).toHaveText('a.ts');
    await expect(aRow).not.toHaveAttribute('data-review-state', 'approved');
    await filterFiles('Unapproved');
    await expect(aRow).toBeVisible();
    await expect(newRow).toHaveCount(0);
    await filterFiles('Flagged');
    await expect(files.getByText('No files match this filter.')).toBeVisible();
    await filterFiles('All');
    await flag.click();
    await expect(title).toHaveText('new.ts');
    await page.reload();
    await expect(noFilter).toBeVisible();
    await expect(title).toHaveText('a.ts');
    await expect(removeFlag).toHaveAttribute('aria-pressed', 'true');
    await expect(aRow).toHaveAttribute('data-review-state', 'flagged');
    await expect(newRow).toHaveAttribute('data-review-state', 'approved');
    await removeFlag.click();
    await expect(title).toHaveText('a.ts');
    await expect(aRow).not.toHaveAttribute('data-review-state', 'flagged');
    await flag.click();
    await expect(title).toHaveText('new.ts');

    // A new commit clears the decision on the file it changed.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('pullRequestFiles.list');
      ipcMain.handle('pullRequestFiles.list', () => ({
        headSha: 'abcdef2',
        mergeBase: 'abcdef0',
        files: [
          {
            path: 'a.ts',
            blobSha: 'sha-a.ts',
            previousPath: null,
            status: 'modified',
            additions: 1,
            deletions: 1,
            hunks: null,
          },
          {
            path: 'new.ts',
            blobSha: 'sha-new.ts-2',
            previousPath: null,
            status: 'added',
            additions: 1,
            deletions: 0,
            hunks: null,
          },
        ],
      }));
    });
    await page.reload();
    await nextFile.click();
    await expect(title).toHaveText('new.ts');
    await expect(approve).toHaveAttribute('aria-pressed', 'false');
    await expect(flag).toHaveAttribute('aria-pressed', 'false');
    await page.screenshot({ path: test.info().outputPath('file-review-controls.png') });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await fileIndicator.evaluate((el) =>
        getComputedStyle(el)
          .transitionDuration.split(',')
          .every((duration) => parseFloat(duration) === 0),
      ),
    ).toBe(true);
    expect(
      await page
        .locator('main > div > div')
        .last()
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe('0s');
  } finally {
    await app.close();
  }
});

test('configures review shortcuts and scrolls without focusing the code', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Review layout') });
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1100, 800);
      const responses: Record<string, unknown> = {
        'pullRequestFiles.list': {
          headSha: 'abcdef1',
          mergeBase: 'abcdef0',
          files: [
            {
              path: 'a.ts',
              blobSha: 'sha-a.ts',
              previousPath: null,
              status: 'modified',
              additions: 1,
              deletions: 1,
              hunks: null,
            },
            {
              path: 'new.ts',
              blobSha: 'sha-new.ts',
              previousPath: null,
              status: 'added',
              additions: 1,
              deletions: 0,
              hunks: null,
            },
          ],
        },
        'pullRequestFiles.getDiff': {
          original: Array.from({ length: 180 }, (_, i) => `const line${i} = 1;`).join('\n'),
          modified: Array.from({ length: 180 }, (_, i) => `const line${i} = 2;`).join('\n'),
          unavailable: null,
        },
      };
      for (const [channel, response] of Object.entries(responses)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input: { path?: string } | undefined) =>
          channel === 'pullRequestFiles.getDiff' && input?.path === 'new.ts'
            ? { original: '', modified: 'export const added = true;\n', unavailable: null }
            : response,
        );
      }
    });
    await mockFileReviewMarks(app);

    await openReview(app, page);
    const title = page.locator('#review-file-title');
    const files = page.locator('#review-files');
    const nav = page.locator('#main-sidebar');
    const globalSearch = page.getByPlaceholder('Search pull requests, files, or repositories…');
    const search = page.getByPlaceholder('Search files or text…');
    const modified = page.locator('.modified-in-monaco-diff-editor');
    const thumb = modified.locator('.scrollbar.vertical .slider');
    await expect(title).toHaveText('a.ts');
    // The review has its own file search, so the global one is hidden.
    await expect(globalSearch).toBeHidden();
    await expect(thumb).toBeVisible();
    await page.getByRole('heading', { name: 'Repository #7' }).click();
    const thumbTop = () => thumb.evaluate((el) => parseFloat((el as HTMLElement).style.top));
    const startTop = await thumbTop();
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await expect.poll(thumbTop).toBeGreaterThan(startTop);
    await page.keyboard.press('k');
    await page.keyboard.press('k');
    await page.keyboard.press('k');
    await expect.poll(thumbTop).toBe(startTop);

    // Holding J advances smoothly without waiting for OS key-repeat events.
    await page.keyboard.down('j');
    await page.waitForTimeout(250);
    await expect.poll(thumbTop).toBeGreaterThan(startTop);
    await page.keyboard.up('j');
    await page.waitForTimeout(300);
    const releasedTop = await thumbTop();
    await page.waitForTimeout(120);
    expect(await thumbTop()).toBe(releasedTop);
    await page.keyboard.down('k');
    await expect.poll(thumbTop).toBe(startTop);
    await page.keyboard.up('k');
    // Blur cancels the frame loop even if the key-up event is missed.
    await page.keyboard.down('j');
    await page.waitForTimeout(180);
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('blur'));
      // Let Monaco paint the scroll position already committed before cancellation.
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    const blurredTop = await thumbTop();
    await page.waitForTimeout(120);
    expect(await thumbTop()).toBe(blurredTop);
    await page.keyboard.up('j');
    await page.keyboard.down('k');
    await expect.poll(thumbTop).toBe(startTop);
    await page.keyboard.up('k');

    // The file search lives in the files panel, which starts expanded.
    await expect(files).toBeVisible();
    await search.fill('');
    await search.press('j');
    await expect(search).toHaveValue('j');
    await search.press('Control+n');
    // Typing filtered the list. Once it is cleared, the diff must not have moved.
    await search.fill('');
    await expect(title).toHaveText('a.ts');
    await expect.poll(thumbTop).toBe(startTop);
    await page.getByRole('heading', { name: 'Repository #7' }).click();
    await page.keyboard.press('Control+t');
    await expect(files).toBeHidden();
    // A comment input and an open dialog both suppress all review shortcuts.
    await page.evaluate(() => {
      const input = document.createElement('textarea');
      input.setAttribute('aria-label', 'Comment test input');
      document.body.append(input);
      input.focus();
    });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('j');
    await expect(page.getByLabel('Comment test input')).toHaveValue('j');
    await expect(page.getByRole('button', { name: 'Approve file', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.evaluate(() => {
      document.querySelector('[aria-label="Comment test input"]')?.remove();
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.tabIndex = 0;
      dialog.textContent = 'Shortcut test dialog';
      document.body.append(dialog);
      dialog.focus();
    });
    await page.keyboard.press('Control+f');
    await page.keyboard.press('j');
    await expect(page.getByRole('button', { name: 'Flag file', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect.poll(thumbTop).toBe(startTop);
    await page.evaluate(() => {
      document.querySelector('[role="dialog"]')?.remove();
    });

    await page.keyboard.press('Control+n');
    await expect(title).toHaveText('new.ts');
    await page.keyboard.press('Control+p');
    await expect(title).toHaveText('a.ts');
    await page.keyboard.press('Control+f');
    await expect(title).toHaveText('new.ts');
    await page.keyboard.press('Control+p');
    await expect(page.getByRole('button', { name: 'Remove file flag' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Control+a');
    await expect(title).toHaveText('new.ts');
    await page.keyboard.press('Control+p');
    await expect(page.getByRole('button', { name: 'Remove file approval' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(nav).toBeVisible();
    await page.keyboard.press('Control+t');
    await expect(files).toBeVisible();
    const fullWidth = await modified.evaluate((el) => el.getBoundingClientRect().width);
    await page.keyboard.press('Control+z');
    await expect(nav).toBeHidden();
    await expect(files).toBeHidden();
    await expect(search).toBeHidden();
    await expect(page.getByRole('button', { name: 'Exit Zen mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(() => modified.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(fullWidth);
    await page.screenshot({ path: test.info().outputPath('review-zen.png') });
    await page.keyboard.press('Control+z');
    await expect(nav).toBeVisible();
    await expect(files).toBeVisible();
    await expect(search).toBeVisible();
    await page.getByRole('button', { name: 'Enter Zen mode' }).click();
    await page.getByRole('button', { name: 'Exit Zen mode' }).click();
    await expect(nav).toBeVisible();
    await expect(files).toBeVisible();
    await page.getByRole('button', { name: 'Enter Zen mode' }).click();
    await expect(nav).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(nav).toBeVisible();
    await expect(files).toBeVisible();

    // Reconfigure through Settings, then verify persistence and the new bindings.
    await nav.getByRole('link', { name: 'Settings', exact: true }).click();
    const leader = page.getByRole('combobox', { name: 'Leader key' });
    await expect(leader).toHaveText('Ctrl');
    await leader.click();
    await page.getByRole('option', { name: 'Ctrl+Shift', exact: true }).click();
    await expect(leader).toHaveText('Ctrl+Shift');
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.preview.settings.getAll().then((settings) => settings.reviewLeader),
        ),
      )
      .toBe('Control+Shift');
    await page.reload();
    await expect(leader).toHaveText('Ctrl+Shift');
    await page.keyboard.press('Control+Shift+b');
    await expect(nav).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('shortcut-settings.png') });
    await page.evaluate(() => {
      location.hash = '/review/1';
    });
    await expect(title).toHaveText('a.ts');
    await expect(page.getByRole('button', { name: 'Next file', exact: true })).toHaveAttribute(
      'title',
      'Next file (Ctrl+Shift+N)',
    );
    await page.keyboard.press('Control+n');
    await expect(title).toHaveText('a.ts');
    await page.keyboard.press('Control+Shift+n');
    await expect(title).toHaveText('new.ts');
    await page.keyboard.press('Control+Shift+p');
    await expect(title).toHaveText('a.ts');
    // Scrolling also works when Monaco's read-only input has focus.
    await modified.locator('.native-edit-context').focus();
    const codeFocusedTop = await thumbTop();
    await page.keyboard.press('j');
    await expect.poll(thumbTop).toBeGreaterThan(codeFocusedTop);
  } finally {
    await app.close();
  }
});

test('changes a review shortcut in Settings', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Custom shortcuts'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts')],
      },
      'pullRequestFiles.getDiff': changedLine,
    });
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click();
    const zen = page.getByRole('button', { name: 'Change shortcut for Toggle Zen mode' });
    const alert = page.getByRole('alert');

    await zen.click();
    await page.keyboard.press('n');
    await expect(alert).toHaveText('N is already used for Next file.');
    await page.keyboard.press('c');
    await expect(alert).toContainText('C is kept for system shortcuts');
    await page.keyboard.press('Escape');
    await expect(zen).toHaveText('Ctrl+Z');

    await zen.click();
    await page.keyboard.press('Control+y');
    await expect(zen).toHaveText('Ctrl+Y');
    await expect
      .poll(() => page.evaluate(() => window.preview.settings.getAll()))
      .toMatchObject({ reviewKeys: { zen: 'y' } });

    await openReview(app, page);
    const enter = page.getByRole('button', { name: 'Enter Zen mode' });
    await expect(enter).toHaveAttribute('title', 'Enter Zen mode (Ctrl+Y)');
    await page.keyboard.press('Control+z');
    await expect(enter).toBeVisible();
    await page.keyboard.press('Control+y');
    await expect(page.getByRole('button', { name: 'Exit Zen mode' })).toBeVisible();

    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      location.hash = '/settings';
    });
    await page.getByRole('button', { name: 'Reset Shortcuts' }).click();
    await expect(zen).toHaveText('Ctrl+Z');
  } finally {
    await app.close();
  }
});

test('submits a review, and only allows a comment on your own pull request', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1100, 800);
      const submitted: unknown[] = [];
      Object.assign(globalThis, { submittedReviews: submitted });
      const pull = (id: number, login: string) => ({
        id,
        repositoryId: 1,
        number: id,
        title: `Pull ${id}`,
        draft: false,
        url: `https://github.com/octo/app/pull/${id}`,
        author: { login, avatarUrl: 'https://avatars.githubusercontent.com/u/1', bot: false },
        headBranch: 'feature',
        headSha: 'abcdef1',
        baseBranch: 'main',
        createdAt: '2026-10-31T12:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      });
      const handlers: Record<string, (input: never) => unknown> = {
        'github.getAuth': () => ({
          accounts: [
            {
              login: 'me',
              name: null,
              avatarUrl: 'https://avatars.githubusercontent.com/u/2',
              source: 'oauth',
            },
          ],
        }),
        // The review screen takes the reviewer from the repository's account.
        'repositories.list': () => ({
          repositories: [
            {
              id: 1,
              path: '/code/app',
              name: 'app',
              remoteUrl: 'https://github.com/octo/app.git',
              github: { owner: 'octo', name: 'app' },
              account: { login: 'me', manual: false },
              status: 'available',
              settings: { monitored: true, includeDrafts: true, includeAutomated: true },
            },
          ],
          scanning: false,
        }),
        'pullRequests.list': () => ({
          pullRequests: [pull(1, 'me'), pull(2, 'someone-else')],
          errors: [],
          syncing: false,
        }),
        'pullRequestFiles.list': () => ({
          headSha: 'abcdef1',
          mergeBase: 'abcdef0',
          files: [
            {
              path: 'a.ts',
              blobSha: 'sha-a.ts',
              previousPath: null,
              status: 'modified',
              additions: 1,
              deletions: 1,
              hunks: null,
            },
          ],
        }),
        'pullRequestFiles.getDiff': () => ({
          original: 'const a = 1;\n',
          modified: 'const a = 2;\n',
          unavailable: null,
          images: null,
        }),
        'pullRequestReviews.submit': (input) => {
          submitted.push(input);
          const { verdict, pullRequestId } = input as { verdict: string; pullRequestId: number };
          if (verdict === 'request-changes') {
            return { status: 'rejected', message: 'Pull request is locked.' };
          }
          // GitHub can't be reached for the second pull request's approval.
          if (pullRequestId === 2) {
            (globalThis as { queued?: boolean }).queued = true;
            return { status: 'queued' };
          }
          return { status: 'submitted' };
        },
        'pullRequestReviews.getQueued': () =>
          (globalThis as { queued?: boolean }).queued ? { queuedAt: '2026-10-31T12:00:00Z' } : null,
        'pullRequestReviews.merge': (input) => {
          const { method } = input as { method: string };
          if (method === 'rebase') {
            return { status: 'rejected', message: 'Rebase merges are not allowed.' };
          }
          (globalThis as { merged?: unknown }).merged = input;
          return { status: 'merged' };
        },
      };
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });

    // Your own pull request: only a comment, and it needs a summary.
    await page.reload();
    await page.evaluate(() => {
      location.hash = '/review/1';
    });
    await finishReviewWith(page, /^Comment/);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: 'Approve' })).toBeDisabled();
    await expect(dialog.getByRole('radio', { name: 'Request changes' })).toBeDisabled();
    await expect(dialog.getByRole('radio', { name: 'Comment' })).toBeChecked();
    const send = dialog.getByRole('button', { name: 'Submit review' });
    await expect(send).toBeDisabled();
    await dialog.getByLabel('Summary').fill('Nice work.');
    await page.screenshot({ path: test.info().outputPath('review-dialog.png') });
    await send.click();
    await expect(dialog.getByRole('heading', { name: 'Review submitted' })).toBeVisible();

    // GitHub won't take an approval from the author, so the dialog offers to merge instead.
    const mergeButton = dialog.getByRole('button', { name: 'Merge pull request' });
    await dialog.getByRole('radio', { name: 'Rebase' }).click();
    await mergeButton.click();
    await expect(dialog.getByRole('alert')).toHaveText('Rebase merges are not allowed.');
    await dialog.getByRole('radio', { name: 'Squash' }).click();
    await mergeButton.click();
    await expect(dialog.getByRole('heading', { name: 'Pull request merged' })).toBeVisible();
    await expect(mergeButton).toBeHidden();
    expect(await app.evaluate(() => (globalThis as { merged?: unknown }).merged)).toEqual({
      pullRequestId: 1,
      headSha: 'abcdef1',
      method: 'squash',
    });
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
    // A merge opens the post-merge screen for the pull request.
    await expect(page).toHaveURL(/#\/post-merge\/1$/);
    expect(
      await app.evaluate(() => (globalThis as { submittedReviews?: unknown[] }).submittedReviews),
    ).toEqual([
      {
        pullRequestId: 1,
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        draftIds: [],
        findingIds: [],
        verdict: 'comment',
        body: 'Nice work.',
      },
    ]);

    // Someone else's pull request: approving needs no summary, and a refusal is shown.
    await page.evaluate(() => {
      location.hash = '/review/2';
    });
    await finishReviewWith(page, /^Approve/);
    await expect(dialog.getByRole('radio', { name: 'Approve' })).toBeEnabled();
    await expect(dialog.getByRole('radio', { name: 'Approve' })).toBeChecked();
    await dialog.getByRole('radio', { name: 'Request changes' }).click();
    await dialog.getByLabel('Summary').fill('Needs work.');
    await dialog.getByRole('button', { name: 'Submit review' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Pull request is locked.');
    await expect(dialog.getByRole('button', { name: 'Submit review' })).toBeEnabled();

    // When GitHub can't be reached, the review is queued, and the screen says it's waiting.
    await dialog.getByRole('radio', { name: 'Approve' }).click();
    await dialog.getByRole('button', { name: 'Submit review' }).click();
    await expect(dialog.getByRole('heading', { name: 'Review queued' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Merge pull request' })).toBeHidden();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL(/#\/inbox$/);
    await page.evaluate(() => {
      location.hash = '/review/2';
    });
    await expect(
      page.getByRole('status').filter({ hasText: 'Review waiting to send' }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test('sends a comment that was still open when the review went to the agent', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Open comment'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [
          {
            ...changedFile('a.ts'),
            hunks: [{ originalStart: 1, originalCount: 1, modifiedStart: 1, modifiedCount: 1 }],
          },
        ],
      },
      'pullRequestFiles.getDiff': changedLine,
    });
    await app.evaluate(({ ipcMain }) => {
      const drafts: Record<string, unknown>[] = [];
      const submitted: unknown[] = [];
      Object.assign(globalThis, { submittedReviews: submitted });
      const handlers: Record<string, (input: never) => unknown> = {
        'reviewDrafts.list': () => drafts,
        'reviewDrafts.create': (input: Record<string, unknown>) => {
          const now = new Date().toISOString();
          drafts.push({ ...input, id: 1, createdAt: now, updatedAt: now, outdated: false });
          return drafts;
        },
        'pullRequestReviews.submit': (input: unknown) => {
          submitted.push(input);
          return { status: 'submitted' };
        },
      };
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });
    await openReview(app, page);

    const modified = page.locator('.modified-in-monaco-diff-editor');
    await modified.locator('.view-line').first().click();
    await page.keyboard.press('Control+i');
    await page.getByRole('textbox', { name: /^Comment on new line/ }).fill('This should add.');

    await finishReviewWith(page, /^Send to Agent/);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('The agent works on 1 line comment.');
    await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Sent to the agent' })).toBeVisible();
    const [review] = await app.evaluate(
      () =>
        (globalThis as unknown as { submittedReviews: { draftIds: number[] }[] }).submittedReviews,
    );
    expect(review?.draftIds).toEqual([1]);
  } finally {
    await app.close();
  }
});

test('drafts, edits, deletes and publishes line comments in the diff', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Comments') });
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1100, 800);
      type Draft = { id: number; body: string } & Record<string, unknown>;
      let drafts: Draft[] = [];
      let nextId = 1;
      const submitted: unknown[] = [];
      Object.assign(globalThis, { submittedReviews: submitted });
      const handlers: Record<string, (input: never) => unknown> = {
        'pullRequestFiles.list': () => ({
          headSha: 'abcdef1',
          mergeBase: 'abcdef0',
          files: [
            {
              path: 'a.ts',
              blobSha: 'sha-a.ts',
              previousPath: null,
              status: 'modified',
              additions: 2,
              deletions: 2,
              // Lines 2 and 13 changed, with 3 lines of context around each.
              hunks: [
                { originalStart: 1, originalCount: 5, modifiedStart: 1, modifiedCount: 5 },
                { originalStart: 10, originalCount: 7, modifiedStart: 10, modifiedCount: 7 },
              ],
            },
          ],
        }),
        'pullRequestFiles.getDiff': () => ({
          original: Array.from({ length: 20 }, (_, i) => `const line${i + 1} = 1;`).join('\n'),
          modified: Array.from({ length: 20 }, (_, i) =>
            i === 1 || i === 12
              ? `const line${i + 1} = 2;`
              : i === 19
                ? `const line20 = '${'x'.repeat(300)}';`
                : `const line${i + 1} = 1;`,
          ).join('\n'),
          unavailable: null,
          images: null,
        }),
        'reviewDrafts.list': () => drafts,
        'pullRequestReviews.submit': (input: unknown) => {
          submitted.push(input);
          return { status: 'submitted' };
        },
        'reviewDrafts.create': (input: Record<string, unknown>) => {
          const now = new Date().toISOString();
          drafts.push({
            ...input,
            id: nextId++,
            body: input.body as string,
            createdAt: now,
            updatedAt: now,
          });
          return drafts;
        },
        'reviewDrafts.update': ({ id, body }: { id: number; body: string }) => {
          drafts = drafts.map((draft) => (draft.id === id ? { ...draft, body } : draft));
          return drafts;
        },
        'reviewDrafts.delete': ({ id }: { id: number }) => {
          drafts = drafts.filter((draft) => draft.id !== id);
          return drafts;
        },
      };
      Object.assign(globalThis, { reviewDrafts: () => drafts });
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });
    await openReview(app, page);

    const modified = page.locator('.modified-in-monaco-diff-editor');
    const lineNumber = (line: number) =>
      modified.locator('.line-numbers').getByText(String(line), { exact: true });
    const glyph = modified.locator('[class*="commentGlyph"]');
    // Monaco reuses line elements as it scrolls, so lines are found by their text, not order.
    const codeLine = (line: number) =>
      modified.locator('.view-line').filter({ hasText: new RegExp(`line${line}\\s=`) });
    // The point just left of a line number, where the plus shows.
    const gutterPoint = async (line: number) => {
      // Monaco redraws line numbers after a layout change, and a composer that just closed can
      // still move them. The measure is retried until two reads agree.
      let box: { x: number; y: number; height: number } | null = null;
      let previous: string | undefined;
      await expect
        .poll(async () => {
          box = await lineNumber(line).boundingBox();
          const read = JSON.stringify(box);
          const settled = box !== null && read === previous;
          previous = read;
          return settled;
        })
        .toBe(true);
      return { x: box!.x - 8, y: box!.y + box!.height / 2 };
    };

    // Unchanged lines are folded. Expanding them shows the lines between the hunks.
    await page.getByRole('button', { name: 'Click or drag to show more below' }).first().click();

    // Lines outside the diff's hunks can't take a comment, because GitHub would refuse it.
    const far = await gutterPoint(7);
    await page.mouse.move(far.x, far.y);
    await expect(glyph).toHaveCount(0);

    const near = await gutterPoint(3);
    await page.mouse.move(near.x, near.y);
    await expect(glyph).toHaveCount(1);
    await glyph.click();

    const field = page.getByRole('textbox', { name: 'Comment on new line 3' });
    await expect(field).toBeFocused();
    // The box stays in view when the code scrolls sideways.
    const codeLeft = async () => (await modified.locator('.editor-scrollable').boundingBox())!.x;
    const fieldLeft = async () => (await field.boundingBox())!.x;
    const before = await fieldLeft();
    await page.mouse.move(near.x + 200, near.y);
    await page.mouse.wheel(400, 0);
    await expect
      .poll(async () => (await modified.locator('.view-lines').boundingBox())!.x)
      .toBeLessThan(await codeLeft());
    await expect.poll(fieldLeft).toBe(before);
    await page.mouse.wheel(-400, 0);
    // Review shortcuts stay off while typing.
    await field.fill('Name this better.');
    await page.screenshot({ path: test.info().outputPath('draft-composer.png') });
    await page.keyboard.press('ControlOrMeta+Enter');
    const card = page.getByRole('article', { name: 'Draft on new line 3' });
    await expect(card).toContainText('Name this better.');
    await expect(card).toContainText('Draft');
    await page.screenshot({ path: test.info().outputPath('draft-comment.png') });
    expect(
      await app.evaluate(() => (globalThis as { reviewDrafts?: () => unknown }).reviewDrafts?.()),
    ).toMatchObject([
      {
        pullRequestId: 1,
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        path: 'a.ts',
        side: 'modified',
        line: 3,
        body: 'Name this better.',
      },
    ]);

    // Drafts come back after a reload.
    await page.reload();
    await expect(card).toContainText('Name this better.');

    await card.getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('textbox', { name: 'Comment on new line 3' });
    await edit.fill('Rename this.');
    await page.getByRole('button', { name: 'Update Draft' }).click();
    await expect(card).toContainText('Rename this.');

    // The shortcut comments on the line with the cursor.
    await lineNumber(2).click();
    await codeLine(2).click();
    await page.keyboard.press('Control+i');
    await expect(page.getByRole('textbox', { name: 'Comment on new line 2' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Comment on new line 2' })).toBeHidden();

    // The shortcut takes every selected line.
    await codeLine(10).click();
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Control+i');
    const selectedRange = page.getByRole('textbox', { name: 'Comment on new lines 10–12' });
    await expect(selectedRange).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(selectedRange).toBeHidden();

    // The plus on a line inside a selection comments on every selected line.
    await codeLine(11).click();
    await page.keyboard.press('Shift+ArrowDown');
    const inside = await gutterPoint(12);
    await page.mouse.move(inside.x, inside.y);
    await glyph.click();
    const selectedByPlus = page.getByRole('textbox', { name: 'Comment on new lines 11–12' });
    await expect(selectedByPlus).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(selectedByPlus).toBeHidden();

    // Dragging down the gutter comments on several lines, and stops at the end of the hunk.
    const top = await gutterPoint(14);
    const bottom = await gutterPoint(18);
    await page.mouse.move(top.x, top.y);
    await expect(glyph).toHaveCount(1);
    await page.mouse.down();
    await page.mouse.move(bottom.x, bottom.y, { steps: 4 });
    await page.mouse.up();
    const range = page.getByRole('textbox', { name: 'Comment on new lines 14–16' });
    await expect(range).toBeFocused();
    await range.fill('Pull these into a helper.');
    await page.keyboard.press('ControlOrMeta+Enter');
    const rangeCard = page.getByRole('article', { name: 'Draft on new lines 14–16' });
    await expect(rangeCard).toContainText('Pull these into a helper.');
    await rangeCard.hover();
    await page.screenshot({ path: test.info().outputPath('draft-range.png') });
    expect(
      await app.evaluate(() => (globalThis as { reviewDrafts?: () => unknown }).reviewDrafts?.()),
    ).toMatchObject([{ line: 3 }, { startLine: 14, line: 16, body: 'Pull these into a helper.' }]);

    // Both drafts are published with the review.
    await finishReviewWith(page, /^Approve/);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Publishes 2 line comments with this review.');
    await dialog.getByRole('radio', { name: 'Comment' }).click();
    await dialog.getByLabel('Summary').fill('A few notes.');
    await dialog.getByRole('button', { name: 'Submit review' }).click();
    await expect(dialog).toContainText('GitHub has your review and 2 line comments.');
    await dialog.getByRole('button', { name: 'Done' }).click();
    expect(
      await app.evaluate(() => (globalThis as { submittedReviews?: unknown[] }).submittedReviews),
    ).toEqual([
      {
        pullRequestId: 1,
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        draftIds: [1, 2],
        findingIds: [],
        verdict: 'comment',
        body: 'A few notes.',
      },
    ]);
    // Sending the review returns to the Inbox. The mocked drafts are still there to delete.
    await expect(page).toHaveURL(/#\/inbox$/);
    await page.evaluate(() => {
      location.hash = '/review/1';
    });
    await rangeCard.getByRole('button', { name: 'Delete draft' }).click();
    await expect(rangeCard).toBeHidden();

    await card.getByRole('button', { name: 'Delete draft' }).click();
    await expect(card).toBeHidden();
    expect(
      await app.evaluate(() => (globalThis as { reviewDrafts?: () => unknown }).reviewDrafts?.()),
    ).toEqual([]);
  } finally {
    await app.close();
  }
});

test('reads, replies to and resolves a discussion in the diff', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Threads'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts')],
      },
      'pullRequestFiles.getDiff': changedLine,
    });
    // The thread is kept in memory, and GitHub refuses the second reopen.
    await app.evaluate(({ ipcMain }) => {
      const comment = (id: string, login: string, body: string) => ({
        id,
        author: { login, avatarUrl: '' },
        body,
        createdAt: '2026-11-01T12:00:00Z',
        url: 'https://github.com/octo/app/pull/7#discussion_r1',
      });
      const thread = {
        id: 'T1',
        path: 'a.ts',
        side: 'modified',
        startLine: null,
        line: 1,
        resolved: false,
        outdated: false,
        comments: [comment('C1', 'octo', 'Why 2?')],
      };
      let reopens = 0;
      const handlers: Record<string, (input: never) => unknown> = {
        'pullRequestReviews.listThreads': () => [thread],
        'pullRequestReviews.replyToThread': ({ body }: { body: string }) => {
          thread.comments.push(comment(`C${thread.comments.length + 1}`, 'me', body));
          return { status: 'saved' };
        },
        'pullRequestReviews.setThreadResolved': ({ resolved }: { resolved: boolean }) => {
          if (!resolved && ++reopens > 1) {
            return { status: 'rejected', message: 'You can’t reopen this thread.' };
          }
          thread.resolved = resolved;
          return { status: 'saved' };
        },
      };
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });
    await openReview(app, page);

    const thread = page.getByRole('region', { name: 'Thread on new line 1' });
    await expect(thread.getByText('Why 2?')).toBeVisible();
    await thread.getByRole('button', { name: 'Reply' }).click();
    await thread.getByRole('textbox', { name: 'Reply to the thread on line 1' }).fill('It is 2.');
    await thread.getByRole('button', { name: 'Reply' }).click();
    await expect(thread.getByText('It is 2.')).toBeVisible();
    await expect(thread.getByRole('textbox')).toBeHidden();

    // A resolved thread can hide its replies.
    await thread.getByRole('button', { name: 'Resolve' }).click();
    await expect(thread.getByText('Resolved')).toBeVisible();
    await thread.getByRole('button', { name: 'Hide replies' }).click();
    await expect(thread.getByText('It is 2.')).toBeHidden();
    await thread.getByRole('button', { name: 'Show 1 reply' }).click();
    await expect(thread.getByText('It is 2.')).toBeVisible();

    await thread.getByRole('button', { name: 'Reopen' }).click();
    await expect(thread.getByRole('button', { name: 'Resolve' })).toBeVisible();
    await thread.getByRole('button', { name: 'Resolve' }).click();
    await thread.getByRole('button', { name: 'Reopen' }).click();
    await expect(thread.getByRole('alert')).toHaveText('You can’t reopen this thread.');
    await expect(thread.getByRole('button', { name: 'Reopen' })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('adds, edits and resolves findings, and keeps published ones read-only', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Findings'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts')],
      },
      'pullRequestFiles.getDiff': changedLine,
    });
    // Findings are kept in memory. One was published with an earlier review, and an agent
    // confirmed it.
    await app.evaluate(({ ipcMain }) => {
      const now = '2026-11-01T12:00:00Z';
      type Finding = Record<string, unknown> & { id: number };
      let findings: Finding[] = [
        {
          id: 1,
          pullRequestId: 1,
          category: 'security',
          description: 'Token is logged',
          steps: 'Open the log.',
          screenshotIds: [],
          validation: 'validated',
          resolution: 'open',
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ];
      let nextId = 2;
      const handlers: Record<string, (input: never) => unknown> = {
        'reviewFindings.list': () => findings,
        'reviewFindings.create': (input: Record<string, unknown>) => {
          findings.push({
            ...input,
            screenshotIds: [],
            id: nextId++,
            validation: 'pending',
            resolution: 'open',
            publishedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          return findings;
        },
        'reviewFindings.update': ({ id, ...input }: Finding) => {
          findings = findings.map((finding) =>
            finding.id === id ? { ...finding, ...input } : finding,
          );
          return findings;
        },
        'reviewFindings.setResolution': ({ id, resolution }: Finding) => {
          findings = findings.map((finding) =>
            finding.id === id ? { ...finding, resolution } : finding,
          );
          return findings;
        },
        'reviewFindings.delete': ({ id }: Finding) => {
          findings = findings.filter((finding) => finding.id !== id);
          return findings;
        },
      };
      Object.assign(globalThis, { reviewFindings: () => findings });
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });
    await openReview(app, page);

    await page.getByRole('button', { name: 'Findings, 1 open' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add finding' }).click();
    await expect(dialog.getByRole('heading', { name: 'New finding' })).toBeVisible();
    await dialog.getByRole('radio', { name: 'UI bug' }).click();
    await dialog.getByLabel('Description').fill('Button overlaps\nOn narrow windows.');
    // A dropped image is attached as WebP, and a dropped text file is refused.
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==';
    const drop = dialog.getByTestId('screenshot-drop');
    const dropFile = async (name: string, type: string, base64: string) => {
      const dataTransfer = await page.evaluateHandle(
        ([fileName, fileType, data]) => {
          const bytes = Uint8Array.from(atob(data!), (char) => char.charCodeAt(0));
          const transfer = new DataTransfer();
          transfer.items.add(new File([bytes], fileName!, { type: fileType! }));
          return transfer;
        },
        [name, type, base64],
      );
      await drop.dispatchEvent('drop', { dataTransfer });
    };
    await dropFile('notes.txt', 'text/plain', 'aGk=');
    await expect(dialog.getByText('Only images can be attached.')).toBeVisible();
    await dropFile('bug.png', 'image/png', png);
    await expect(dialog.getByRole('button', { name: 'Open screenshot 1' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Unpublished: 1.')).toBeVisible();
    const attached = await app.evaluate(
      () =>
        (globalThis as unknown as { reviewFindings: () => { newScreenshots?: string[] }[] })
          .reviewFindings()
          .at(-1)?.newScreenshots,
    );
    expect(attached).toHaveLength(1);
    expect(attached![0]).toMatch(/^data:image\/webp;base64,/);

    // An unpublished finding opens to edit.
    await dialog.getByRole('button', { name: /Button overlaps/ }).click();
    await expect(dialog.getByRole('heading', { name: 'Edit finding' })).toBeVisible();
    await dialog.getByLabel('Steps to reproduce (optional)').fill('Make the window narrow.');
    await dialog.getByRole('button', { name: 'Save' }).click();
    expect(
      await app.evaluate(() =>
        (globalThis as unknown as { reviewFindings: () => unknown[] }).reviewFindings(),
      ),
    ).toContainEqual(
      expect.objectContaining({
        id: 2,
        category: 'ui-bug',
        description: 'Button overlaps\nOn narrow windows.',
        steps: 'Make the window narrow.',
      }),
    );

    // A published finding can only be resolved, and shows the agent's check.
    await dialog.getByRole('button', { name: /Token is logged/ }).click();
    await expect(dialog.getByRole('heading', { name: 'Security finding' })).toBeVisible();
    await expect(dialog.getByText('Validated')).toBeVisible();
    await expect(dialog.getByLabel('Description')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Resolve' }).click();
    await expect(dialog.getByRole('button', { name: 'Reopen' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Back' }).click();
    await dialog.getByRole('button', { name: /Button overlaps/ }).click();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog.getByRole('button', { name: /Button overlaps/ })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close' }).click();
    // The resolved finding no longer counts as open.
    await expect(page.getByRole('button', { name: 'Findings, 0 open' })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('submits to the agent with an optional message', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Agent'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts')],
      },
      'pullRequestFiles.getDiff': changedLine,
      'pullRequestReviews.listThreads': [],
      'reviewFindings.list': [],
    });
    await app.evaluate(({ ipcMain }) => {
      const submitted: unknown[] = [];
      Object.assign(globalThis, { submittedReviews: submitted });
      ipcMain.removeHandler('pullRequestReviews.submit');
      ipcMain.handle('pullRequestReviews.submit', (_event, input) => {
        submitted.push(input);
        return { status: 'submitted' };
      });
    });
    await openReview(app, page);
    const dialog = page.getByRole('dialog');
    const open = () => finishReviewWith(page, /^Send to Agent/);
    const submit = dialog.getByRole('button', { name: 'Submit', exact: true });

    // With nothing to work on, it needs a message.
    await open();
    await expect(
      dialog.getByText('There are no comments or findings yet.', { exact: false }),
    ).toBeVisible();
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Message (optional)').fill('Rename this file.');
    await expect(submit).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // An outdated discussion gives the agent nothing to work on.
    await mockIpc(app, {
      'pullRequestReviews.listThreads': [
        {
          id: 'T0',
          path: 'a.ts',
          side: 'modified',
          startLine: null,
          line: 1,
          resolved: false,
          outdated: true,
          comments: [],
        },
      ],
    });
    await page.reload();
    await open();
    await expect(dialog.getByText('There are no comments or findings yet.')).toBeVisible();
    await expect(submit).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // With an open discussion, an empty message gets the default GitHub needs.
    await mockIpc(app, {
      'pullRequestReviews.listThreads': [
        {
          id: 'T1',
          path: 'a.ts',
          side: 'modified',
          startLine: null,
          line: 1,
          resolved: false,
          outdated: false,
          comments: [
            {
              id: 'C1',
              author: { login: 'octo', avatarUrl: '' },
              body: 'Why 2?',
              createdAt: '2026-11-01T12:00:00Z',
              url: 'https://github.com/octo/app/pull/7#discussion_r1',
            },
          ],
        },
      ],
    });
    await page.reload();
    await open();
    await expect(dialog.getByText('The agent works on 1 open discussion.')).toBeVisible();
    await dialog.getByLabel('Message (optional)').fill('');
    await submit.click();
    await expect(dialog.getByRole('heading', { name: 'Sent to the agent' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL(/#\/inbox$/);
    expect(
      await app.evaluate(() => (globalThis as { submittedReviews?: unknown[] }).submittedReviews),
    ).toEqual([
      {
        pullRequestId: 1,
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        draftIds: [],
        findingIds: [],
        verdict: 'comment',
        body: 'Findings are in the comments.',
        sendToAgent: true,
      },
    ]);
  } finally {
    await app.close();
  }
});

test('groups tests and generated files until it is turned off in Settings', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Groups'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts'), changedFile('pnpm-lock.yaml')],
      },
      'pullRequestFiles.getDiff': changedLine,
    });
    await openReview(app, page);
    const files = page.locator('#review-files');
    const group = files.getByRole('button', { name: /Tests, stories & generated/ });
    await expect(group).toBeVisible();
    await expect(files.getByRole('button', { name: /pnpm-lock.yaml/ })).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('file-filter.png') });

    // The review screen has no control for it. It's one setting for every list.
    await expect(page.getByRole('button', { name: /Group tests/ })).toHaveCount(0);
    await page.evaluate(() => {
      location.hash = '/settings';
    });
    await page.getByRole('switch', { name: /^Group tests and generated files/ }).click();
    await page.evaluate(() => {
      location.hash = '/review/1';
    });
    await expect(files.getByRole('button', { name: /pnpm-lock.yaml/ })).toBeVisible();
    await expect(group).toBeHidden();
  } finally {
    await app.close();
  }
});

test('finishes a review once and keeps it finished', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Finish this') });
    await app.evaluate(({ ipcMain }) => {
      const responses: Record<string, unknown> = {
        'pullRequestFiles.list': { headSha: 'abcdef1', mergeBase: 'abcdef0', files: [] },
      };
      for (const [channel, response] of Object.entries(responses)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => response);
      }
      // The mocked pull request is not in the database, so the completion is kept in memory.
      let finishedAt: string | null = null;
      ipcMain.removeHandler('reviewRounds.sync');
      ipcMain.handle('reviewRounds.sync', () => [
        {
          number: 1,
          headSha: 'abcdef1',
          baselineSha: null,
          startedAt: '2026-11-02T11:00:00.000Z',
          submittedAt: null,
          finishedAt,
        },
      ]);
      ipcMain.removeHandler('reviewCompletions.finish');
      ipcMain.handle('reviewCompletions.finish', () => {
        finishedAt ??= '2026-11-02T12:00:00.000Z';
        return { completedAt: finishedAt };
      });
    });
    await openReview(app, page);

    await finishReviewWith(page, /^Finish Without Submitting/);
    await page.getByRole('button', { name: 'Finish Review' }).click();
    await expect(page.getByRole('menuitem', { name: 'Review Finished' })).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Finish Review' }).click();
    await expect(page.getByRole('menuitem', { name: 'Review Finished' })).toBeDisabled();
  } finally {
    await app.close();
  }
});

test('closes a pull request from the Finish Review menu, after asking', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Finish this'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts')],
      },
      'pullRequestFiles.getDiff': changedLine,
    });
    await openReview(app, page);

    // The menu picks the verdict the dialog opens with.
    await finishReviewWith(page, /^Request Changes/);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: 'Request changes' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await mockIpc(app, {
      'pullRequestReviews.close': { status: 'rejected', message: 'Not allowed.' },
    });
    await finishReviewWith(page, /^Close Pull Request/);
    await dialog.getByRole('button', { name: 'Close Pull Request' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Not allowed.');

    await mockIpc(app, { 'pullRequestReviews.close': { status: 'closed' } });
    await dialog.getByRole('button', { name: 'Close Pull Request' }).click();
    await expect(page).toHaveURL(/#\/inbox$/);
  } finally {
    await app.close();
  }
});

test('shows the pull request details, with its description', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Add login'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts')],
      },
      'pullRequestFiles.getDiff': changedLine,
      'pullRequestFiles.getDescription':
        '## Summary\n\nAdds a **login** page.\n\n<b>raw</b>\n\n[bad](javascript:alert(1))',
    });
    await openReview(app, page);

    await page.getByRole('button', { name: 'Details' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Add login' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Summary' })).toBeVisible();
    await expect(dialog.locator('strong', { hasText: 'login' })).toBeVisible();
    await expect(dialog.locator('b')).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'bad' })).not.toHaveAttribute(
      'href',
      /javascript/,
    );
    await expect(dialog.getByRole('button', { name: 'View on GitHub' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await app.close();
  }
});

test('opens a re-review on the changes since the last review', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Second look') });
    await mockReReview(app);
    await openReview(app, page);
    const files = page.locator('#review-files');

    await expect(page.getByText('Round 2')).toBeVisible();
    await expect(files.getByRole('combobox', { name: 'Commit' })).toHaveText(/Since last review/);
    await expect(files.getByRole('button', { name: /b.ts/ })).toBeVisible();
    await expect(files.getByRole('button', { name: /a.ts/ })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Approve file', exact: true })).toBeDisabled();

    await files.getByRole('combobox', { name: 'Commit' }).click();
    await page.getByRole('option', { name: 'All changes' }).click();
    await expect(files.getByRole('button', { name: /a.ts/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve file', exact: true })).toBeEnabled();
  } finally {
    await app.close();
  }
});

test('keeps a pull request with thousands of files quick to scroll and select', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    const files = Array.from({ length: 3000 }, (_, index) =>
      changedFile(`src/part${index % 40}/file${index}.ts`),
    );
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Big change') });
    await mockIpc(app, {
      'pullRequestFiles.list': { headSha: 'abcdef1', mergeBase: 'abcdef0', files },
      'pullRequestFiles.listCommits': [],
      'pullRequestFiles.getDiff': changedLine,
      'reviewRounds.sync': [],
    });
    await openReview(app, page);
    const list = page.locator('#review-files ul');
    await expect(list.locator('button[title="src/part0/file0.ts"]')).toBeVisible();
    // Only the rows in view are rendered.
    expect(await list.locator('button').count()).toBeLessThan(100);

    await list.locator('button[title="src/part1/file1.ts"]').click();
    await expect(list.locator('button[aria-current="true"]')).toHaveAttribute(
      'title',
      'src/part1/file1.ts',
    );

    await list.evaluate((element) => (element.scrollTop = element.scrollHeight));
    const last = list.locator('button[title="src/part39/file2999.ts"]');
    await expect(last).toBeVisible();
    await last.click();
    await expect(list.locator('button[aria-current="true"]')).toHaveAttribute(
      'title',
      'src/part39/file2999.ts',
    );
    await page.screenshot({ path: test.info().outputPath('large-pr.png') });
  } finally {
    await app.close();
  }
});

test('browses a file the pull request does not change', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Second look') });
    await mockIpc(app, {
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts'), changedFile('b.ts')],
      },
      'pullRequestFiles.listCommits': [
        { sha: 'e'.repeat(40), subject: 'Touch b', authorLogin: 'octo' },
      ],
      'pullRequestFiles.listRepositoryFiles': {
        headSha: 'abcdef1',
        paths: ['a.ts', 'b.ts', 'docs/README.md'],
        truncated: false,
      },
      'pullRequestFiles.getDiff': changedLine,
      'reviewRounds.sync': [],
    });
    await openReview(app, page);
    const files = page.locator('#review-files');

    // The list sits under the search and totals, not at the bottom of the panel.
    const search = await files
      .getByRole('searchbox', { name: 'Search files or text' })
      .boundingBox();
    const first = await files.getByRole('button', { name: /a.ts/ }).boundingBox();
    expect((first?.y ?? 0) - ((search?.y ?? 0) + (search?.height ?? 0))).toBeLessThan(120);

    await files.getByRole('radio', { name: 'Repository' }).click();
    await expect(page.getByRole('heading', { name: 'Repository files' })).toBeVisible();
    const tree = files.getByRole('tree', { name: 'Repository files' });
    const docs = tree.getByRole('treeitem', { name: 'docs', exact: true });
    const readme = tree.getByRole('treeitem', { name: 'README.md', exact: true });
    // Folders start closed, open on a click and close on the left arrow.
    await expect(docs).toHaveAttribute('aria-expanded', 'false');
    await expect(readme).toBeHidden();
    await docs.click();
    await expect(readme).toBeVisible();
    await docs.press('ArrowLeft');
    await expect(readme).toBeHidden();
    // A search opens every folder that holds a match.
    await files.getByRole('searchbox', { name: 'Search repository files' }).fill('readme');
    await expect(tree.getByRole('treeitem', { name: 'a.ts', exact: true })).toBeHidden();
    await readme.click();
    await expect(page.getByRole('heading', { name: 'docs/README.md' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve file', exact: true })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Split' })).toBeDisabled();

    await files.getByRole('radio', { name: 'Changed' }).click();
    await expect(files.getByRole('button', { name: /a.ts/ })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('searches the text of every file in the repository and opens a match', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, {
      'pullRequests.list': pullRequestsState('Search it'),
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts')],
      },
      'pullRequestFiles.listCommits': [],
      'pullRequestFiles.listRepositoryFiles': {
        headSha: 'abcdef1',
        paths: ['a.ts', 'docs/guide.md'],
        truncated: false,
      },
      'pullRequestFiles.getDiff': {
        original: 'first line\nsecond line\n',
        modified: 'first line\nsecond line\n',
        unavailable: null,
      },
      'repositorySearch.search': {
        headSha: 'abcdef1',
        source: 'clone',
        matches: [
          { path: 'docs/guide.md', line: 2, preview: 'second line' },
          { path: 'docs/guide.md', line: 9, preview: 'second use' },
        ],
        partial: false,
      },
      'reviewRounds.sync': [],
    });
    await openReview(app, page);
    const files = page.locator('#review-files');
    await files.getByRole('radio', { name: 'Repository' }).click();

    await files.getByRole('radio', { name: 'Text' }).click();
    const field = files.getByRole('searchbox', { name: 'Search text in the repository' });
    await field.fill('s');
    await expect(files.getByText('Type at least two characters.')).toBeVisible();
    await field.fill('second');
    await expect(files.getByText('2 matches in 1 file.')).toBeVisible();

    await files.getByRole('button', { name: /9\s+second use/ }).click();
    await expect(page.getByRole('heading', { name: 'docs/guide.md' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve file', exact: true })).toBeDisabled();
    await expect(files.getByRole('button', { name: /9\s+second use/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  } finally {
    await app.close();
  }
});

test('reopens a re-review on the changes the reviewer chose', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Second look') });
    await mockReReview(app, {
      'reviewSessions.get': {
        pullRequestId: 1,
        selectedPath: null,
        scrollTop: 0,
        diffMode: 'split',
        view: 'all',
      },
    });
    await openReview(app, page);
    const files = page.locator('#review-files');

    await expect(page.getByText('Round 2')).toBeVisible();
    await expect(files.getByRole('combobox', { name: 'Commit' })).toHaveText(/All changes/);
    await expect(files.getByRole('button', { name: /a.ts/ })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('moves drafts from older commits and flags the ones it cannot place', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Moved drafts') });
    await app.evaluate(({ ipcMain }) => {
      const head = 'abcdef1';
      const base = 'abcdef0';
      const draft = (id: number, line: number, headSha: string, outdated: boolean) => ({
        id,
        pullRequestId: 1,
        headSha,
        mergeBase: base,
        path: 'a.ts',
        side: 'modified',
        startLine: null,
        line,
        outdated,
        body: id === 1 ? 'Still fits.' : 'Code changed.',
        createdAt: '2026-11-02T11:00:00.000Z',
        updatedAt: '2026-11-02T11:00:00.000Z',
      });
      // Both drafts were written on an older commit. Reattaching moves one and flags the other.
      let drafts = [draft(1, 1, 'f'.repeat(40), false), draft(2, 1, 'f'.repeat(40), false)];
      const reattached: unknown[] = [];
      Object.assign(globalThis, { reattached });
      const handlers: Record<string, (input: never) => unknown> = {
        'pullRequestFiles.list': () => ({
          headSha: head,
          mergeBase: base,
          files: [
            {
              path: 'a.ts',
              blobSha: 'sha-a.ts',
              previousPath: null,
              status: 'modified',
              additions: 1,
              deletions: 1,
              hunks: [{ originalStart: 1, originalCount: 1, modifiedStart: 1, modifiedCount: 1 }],
            },
          ],
        }),
        'pullRequestFiles.getDiff': () => ({
          original: 'const a = 1;\n',
          modified: 'const a = 2;\n',
          unavailable: null,
        }),
        'reviewDrafts.list': () => drafts,
        'reviewDrafts.reattach': (move: never) => {
          reattached.push(move);
          drafts = [draft(1, 1, head, false), draft(2, 1, head, true)];
          return drafts;
        },
      };
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });
    await openReview(app, page);

    await expect(page.getByLabel('Draft on new line 1').first()).toBeVisible();
    await expect(page.getByText('Outdated')).toHaveCount(1);
    expect(await app.evaluate(() => (globalThis as { reattached?: unknown[] }).reattached)).toEqual(
      [{ pullRequestId: 1, headSha: 'abcdef1', mergeBase: 'abcdef0' }],
    );

    await finishReviewWith(page, /^Comment/);
    await expect(page.getByText('Publishes 1 line comment with this review.')).toBeVisible();
    await expect(page.getByText('Drafts outside the diff stay here: 1.')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('shows one commit on its own without file decisions', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Review commits') });
    const commit = 'c'.repeat(40);
    await mockIpc(app, {
      'pullRequestFiles.list': {
        headSha: 'abcdef1',
        mergeBase: 'abcdef0',
        files: [changedFile('a.ts'), changedFile('b.ts'), changedFile('pnpm-lock.yaml')],
      },
      'pullRequestFiles.listCommits': [
        {
          sha: commit,
          subject: 'Touch b, with a subject too long to fit in the commit picker on one line',
          authorLogin: 'octo',
        },
      ],
      'pullRequestFiles.listCommit': {
        headSha: commit,
        mergeBase: 'd'.repeat(40),
        files: [changedFile('b.ts')],
      },
      'pullRequestFiles.getDiff': changedLine,
    });
    await openReview(app, page);
    const files = page.locator('#review-files');
    await expect(files.getByRole('button', { name: /a.ts/ })).toBeVisible();
    await expect(files.getByRole('button', { name: /b.ts/ })).toBeVisible();

    await files.getByRole('combobox', { name: 'Commit' }).click();
    await page.getByRole('option', { name: /Touch b/ }).click();
    await expect(files.getByRole('button', { name: /a.ts/ })).toBeHidden();
    await expect(files.getByRole('button', { name: /b.ts/ })).toBeVisible();
    // A long subject stays inside the picker.
    const picker = files.getByRole('combobox', { name: 'Commit' });
    expect(await picker.evaluate((box) => box.scrollWidth <= box.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('long-commit.png') });
    await expect(page.getByRole('button', { name: 'Approve file', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Flag file', exact: true })).toBeDisabled();

    await files.getByRole('combobox', { name: 'Commit' }).click();
    await page.getByRole('option', { name: 'All changes' }).click();
    await expect(files.getByRole('button', { name: /a.ts/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve file', exact: true })).toBeEnabled();

    // Generated files wait for the reviewer, in a group that starts collapsed.
    await files.getByRole('button', { name: /Tests, stories & generated/ }).click();
    await files.getByRole('button', { name: /pnpm-lock.yaml/ }).click();
    await expect(
      page.getByText('This file looks generated, so its diff is collapsed.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Show diff' }).click();
    await expect(page.getByText('This file looks generated')).toBeHidden();
    await expect(page.locator('.monaco-diff-editor')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('folds unchanged lines and reveals a search match inside them', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Fold context') });
    await app.evaluate(({ ipcMain }) => {
      const lines = (value: number) =>
        Array.from({ length: 120 }, (_, i) =>
          i === 10 ? `const changed = ${value};` : `const line${i} = 0;`,
        );
      const responses: Record<string, unknown> = {
        'pullRequestFiles.list': {
          headSha: 'abcdef1',
          mergeBase: 'abcdef0',
          files: [
            {
              path: 'a.ts',
              blobSha: 'sha-a.ts',
              previousPath: null,
              status: 'modified',
              additions: 1,
              deletions: 1,
              hunks: null,
            },
          ],
        },
        'pullRequestFiles.getDiff': {
          original: lines(1).join('\n'),
          modified: lines(2).join('\n'),
          unavailable: null,
        },
      };
      for (const [channel, response] of Object.entries(responses)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => response);
      }
    });
    await openReview(app, page);
    await expect(page.locator('.diff-hidden-lines')).not.toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Search files or text' }).fill('line90');
    await expect(page.locator('.modified-in-monaco-diff-editor')).toContainText(
      'const line90 = 0;',
    );
  } finally {
    await app.close();
  }
});

test('moves a queued agent task in the queue from the Inbox', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await mockIpc(app, { 'pullRequests.list': pullRequestsState('Queued work') });
    await app.evaluate(({ ipcMain }) => {
      let position = 2;
      const moves: unknown[] = [];
      Object.assign(globalThis, { agentMoves: moves });
      ipcMain.removeHandler('agentTasks.list');
      ipcMain.handle('agentTasks.list', () => [
        {
          id: 5,
          pullRequestId: 1,
          status: 'queued',
          attempts: 0,
          error: null,
          queue: { position, total: 3 },
          report: null,
          costUsd: null,
          question: null,
          push: null,
          ci: null,
          createdAt: '2026-10-31T12:00:00Z',
          startedAt: null,
          finishedAt: null,
        },
      ]);
      ipcMain.removeHandler('agentTasks.listActivity');
      ipcMain.handle('agentTasks.listActivity', () => []);
      ipcMain.removeHandler('agentTasks.move');
      ipcMain.handle('agentTasks.move', (_event, input: unknown) => {
        moves.push(input);
        position = 1;
        return null;
      });
    });
    await page.evaluate(() => {
      location.hash = '/inbox';
    });
    await page.reload();
    await page.getByText('Queued work').first().click();

    const activity = page.getByRole('region', { name: 'Agent activity' });
    await expect(activity).toContainText('2 of 3 in queue');
    await activity.getByRole('button', { name: 'Move Up' }).click();
    await expect(activity).toContainText('1 of 3 in queue');
    await expect(activity.getByRole('button', { name: 'Move Up' })).toBeDisabled();
    await expect(activity.getByRole('button', { name: 'Move Down' })).toBeEnabled();
    expect(
      await app.evaluate(() => (globalThis as unknown as { agentMoves: unknown[] }).agentMoves),
    ).toEqual([{ taskId: 5, direction: 'up' }]);
  } finally {
    await app.close();
  }
});

test("shows an agent's work in the Inbox and answers its question", async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 900);
      const answers: unknown[] = [];
      Object.assign(globalThis, { agentAnswers: answers });
      const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
      let task: Record<string, unknown> = {
        id: 5,
        pullRequestId: 1,
        status: 'waiting',
        attempts: 1,
        error: null,
        report: null,
        costUsd: null,
        question: {
          id: 9,
          createdAt: minutesAgo(1),
          questions: [
            {
              question: 'Should the old endpoint keep working?',
              header: 'API',
              multiSelect: false,
              options: [
                { label: 'Keep it', description: 'Clients still call it.' },
                { label: 'Remove it', description: null },
              ],
            },
          ],
        },
        createdAt: minutesAgo(10),
        startedAt: minutesAgo(10),
        finishedAt: null,
      };
      const handlers: Record<string, (input: never) => unknown> = {
        'github.getAuth': () => ({
          accounts: [
            {
              login: 'me',
              name: null,
              avatarUrl: 'https://avatars.githubusercontent.com/u/2',
              source: 'oauth',
            },
          ],
        }),
        'repositories.list': () => ({
          repositories: [
            {
              id: 1,
              path: '/code/app',
              name: 'app',
              remoteUrl: 'https://github.com/octo/app.git',
              github: { owner: 'octo', name: 'app' },
              account: { login: 'me', manual: false },
              status: 'available',
              settings: { monitored: true, includeDrafts: true, includeAutomated: true },
            },
          ],
          scanning: false,
        }),
        'pullRequests.list': () => ({
          pullRequests: [
            {
              id: 1,
              repositoryId: 1,
              number: 7,
              title: 'Add login',
              draft: false,
              url: 'https://github.com/octo/app/pull/7',
              author: null,
              headBranch: 'feature',
              headSha: 'abcdef1',
              baseBranch: 'main',
              reviewState: 'feedback-submitted',
              createdAt: minutesAgo(60),
              updatedAt: minutesAgo(60),
            },
          ],
          errors: [],
          syncing: false,
        }),
        'pullRequests.refresh': () => handlers['pullRequests.list']!(undefined as never),
        'agentTasks.list': () => [task],
        'agentTasks.listActivity': () => [
          {
            id: 1,
            kind: 'status',
            summary: 'Started working',
            detail: null,
            createdAt: minutesAgo(10),
          },
          {
            id: 2,
            kind: 'file',
            summary: 'Edited src/api.ts',
            detail: null,
            createdAt: minutesAgo(5),
          },
          {
            id: 3,
            kind: 'test',
            summary: 'Tests passed',
            detail: '12 passed',
            createdAt: minutesAgo(3),
          },
          {
            id: 4,
            kind: 'question',
            summary: 'Should the old endpoint keep working?',
            detail: null,
            createdAt: minutesAgo(1),
          },
        ],
        'agentTasks.answer': (input) => {
          answers.push(input);
          task = { ...task, status: 'running', question: null };
          return true;
        },
      };
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });
    // The Dashboard already loaded the real data, so reload to read the stubs.
    await page.reload();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Inbox' })
      .click();

    const list = page.getByRole('list').filter({ hasText: 'Add login' }).first();
    await expect(list.getByText('Agent Has a Question')).toBeVisible();
    const agent = page.getByRole('region', { name: 'Agent activity' });
    await expect(agent.getByText('Edited src/api.ts')).toBeVisible();
    await expect(agent.getByText('Clients still call it.')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('agent-question.png') });

    const send = agent.getByRole('button', { name: 'Send Answer' });
    await expect(send).toBeDisabled();
    await agent.getByRole('radio', { name: /Keep it/ }).click();
    await send.click();

    await expect(agent.getByText('Agent Running')).toBeVisible();
    await expect(agent.getByRole('button', { name: 'Send Answer' })).toBeHidden();
    expect(
      await app.evaluate(() => (globalThis as { agentAnswers?: unknown[] }).agentAnswers),
    ).toEqual([{ questionId: 9, answers: { 'Should the old endpoint keep working?': 'Keep it' } }]);
  } finally {
    await app.close();
  }
});

test('shows CI on pushed agent changes and sends the agent back on request', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 900);
      const investigated: unknown[] = [];
      Object.assign(globalThis, { investigated });
      const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
      const handlers: Record<string, (input: never) => unknown> = {
        'github.getAuth': () => ({
          accounts: [
            {
              login: 'me',
              name: null,
              avatarUrl: 'https://avatars.githubusercontent.com/u/2',
              source: 'oauth',
            },
          ],
        }),
        'repositories.list': () => ({
          repositories: [
            {
              id: 1,
              path: '/code/app',
              name: 'app',
              remoteUrl: 'https://github.com/octo/app.git',
              github: { owner: 'octo', name: 'app' },
              account: { login: 'me', manual: false },
              status: 'available',
              settings: { monitored: true, includeDrafts: true, includeAutomated: true },
            },
          ],
          scanning: false,
        }),
        'pullRequests.list': () => ({
          pullRequests: [
            {
              id: 1,
              repositoryId: 1,
              number: 7,
              title: 'Add login',
              draft: false,
              url: 'https://github.com/octo/app/pull/7',
              author: null,
              headBranch: 'feature',
              headSha: 'abcdef1',
              baseBranch: 'main',
              reviewState: 'action-required',
              createdAt: minutesAgo(60),
              updatedAt: minutesAgo(5),
            },
          ],
          errors: [],
          syncing: false,
        }),
        'pullRequests.refresh': () => handlers['pullRequests.list']!(undefined as never),
        'agentTasks.list': () => [
          {
            id: 5,
            pullRequestId: 1,
            status: 'completed',
            attempts: 1,
            error: null,
            report: {
              items: [{ id: 'C1', outcome: 'fixed', note: 'Renamed the store.' }],
              tests: [{ command: 'pnpm test', passed: true, summary: '12 passed' }],
              summary: 'Renamed the token store.',
            },
            costUsd: 0.4,
            question: null,
            push: { status: 'pushed', sha: 'abcdef1234567', error: null },
            ci: {
              status: 'failed',
              checks: [
                { name: 'build', required: true, state: 'passed', url: 'https://ci.test/1' },
                { name: 'e2e', required: true, state: 'failed', url: 'https://ci.test/2' },
                { name: 'docs', required: false, state: 'skipped', url: null },
              ],
            },
            createdAt: minutesAgo(30),
            startedAt: minutesAgo(30),
            finishedAt: minutesAgo(10),
          },
        ],
        'agentTasks.listActivity': () => [],
        'agentTasks.investigate': (input) => {
          investigated.push(input);
          return null;
        },
      };
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });
    // The Dashboard already loaded the real data, so reload to read the stubs.
    await page.reload();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Inbox' })
      .click();

    const agent = page.getByRole('region', { name: 'Agent activity' });
    await expect(agent.getByText('CI Failed')).toBeVisible();
    await expect(agent.getByText('abcdef1', { exact: true })).toBeVisible();
    await expect(agent.getByRole('link', { name: 'e2e' })).toHaveAttribute(
      'href',
      'https://ci.test/2',
    );
    await expect(page.getByText('Action Required').first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('agent-ci.png') });

    await agent.getByRole('button', { name: 'Investigate with Claude' }).click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as { investigated?: unknown[] }).investigated))
      .toEqual([{ taskId: 5 }]);
  } finally {
    await app.close();
  }
});

test("shows the agent's unpushed changes and warns before merging without them", async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await dismissGitHubPrompt(page);
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 900);
      const pushed: unknown[] = [];
      Object.assign(globalThis, { pushed });
      const handlers: Record<string, (input: never) => unknown> = {
        'github.getAuth': () => ({
          accounts: [
            {
              login: 'me',
              name: null,
              avatarUrl: 'https://avatars.githubusercontent.com/u/2',
              source: 'oauth',
            },
          ],
        }),
        // The review screen takes the reviewer from the repository's account.
        'repositories.list': () => ({
          repositories: [
            {
              id: 1,
              path: '/code/app',
              name: 'app',
              remoteUrl: 'https://github.com/octo/app.git',
              github: { owner: 'octo', name: 'app' },
              account: { login: 'me', manual: false },
              status: 'available',
              settings: { monitored: true, includeDrafts: true, includeAutomated: true },
            },
          ],
          scanning: false,
        }),
        'pullRequests.list': () => ({
          pullRequests: [
            {
              id: 1,
              repositoryId: 1,
              number: 7,
              title: 'Add login',
              draft: false,
              url: 'https://github.com/octo/app/pull/7',
              author: {
                login: 'me',
                avatarUrl: 'https://avatars.githubusercontent.com/u/2',
                bot: false,
              },
              headBranch: 'feature',
              headSha: 'abcdef1',
              baseBranch: 'main',
              reviewState: 'feedback-submitted',
              createdAt: '2026-10-31T12:00:00Z',
              updatedAt: '2026-10-31T12:00:00Z',
            },
          ],
          errors: [],
          syncing: false,
        }),
        'pullRequests.refresh': () => handlers['pullRequests.list']!(undefined as never),
        'pullRequestFiles.list': () => ({
          headSha: 'abcdef1',
          mergeBase: 'abcdef0',
          files: [
            {
              path: 'a.ts',
              blobSha: 'sha-a.ts',
              previousPath: null,
              status: 'modified',
              additions: 1,
              deletions: 1,
              hunks: null,
            },
          ],
        }),
        'pullRequestFiles.getDiff': () => ({
          original: 'const a = 1;\n',
          modified: 'const a = 2;\n',
          unavailable: null,
          images: null,
        }),
        'agentTasks.list': () => [
          {
            id: 5,
            pullRequestId: 1,
            status: 'completed',
            attempts: 1,
            error: null,
            report: {
              items: [{ id: 'C1', outcome: 'fixed', note: 'Fixed the typo.' }],
              tests: [],
              summary: 'Fixed the typo.',
            },
            costUsd: 0.2,
            question: null,
            push: { status: 'waiting', sha: null, error: null },
            ci: null,
            createdAt: '2026-10-31T12:00:00Z',
            startedAt: '2026-10-31T12:00:00Z',
            finishedAt: '2026-10-31T12:01:00Z',
          },
        ],
        'agentTasks.listActivity': () => [],
        'agentTasks.changes': () => [
          {
            path: 'src/inbox.tsx',
            status: 'modified',
            patch: '@@ -1 +1 @@\n-colaborate\n+collaborate',
          },
          { path: 'logo.png', status: 'added', patch: null },
        ],
        'agentTasks.push': (input) => {
          pushed.push(input);
          return null;
        },
      };
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input) => handler(input as never));
      }
    });
    // The sign-in is read at launch, so your own pull request needs a reload.
    await page.reload();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Inbox' })
      .click();

    const agent = page.getByRole('region', { name: 'Agent activity' });
    await agent.getByText('src/inbox.tsx').click();
    await expect(agent.getByText('+collaborate')).toBeVisible();
    await expect(agent.getByText('-colaborate')).toBeVisible();
    await agent.getByText('logo.png').click();
    await expect(agent.getByText('Binary file.')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('agent-changes.png') });
    await agent.getByRole('button', { name: 'Push Changes' }).click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as { pushed?: unknown[] }).pushed))
      .toEqual([{ taskId: 5 }]);

    await page.evaluate(() => {
      location.hash = '/review/1';
    });
    await finishReviewWith(page, /^Merge Pull Request/);
    await expect(agent).toBeHidden();
    await expect(page.getByText('Agent Finished')).toBeVisible();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('note')).toHaveText(
      "The agent has changes that aren't pushed. Merging now leaves them out.",
    );
    await page.screenshot({ path: test.info().outputPath('agent-merge-warning.png') });
  } finally {
    await app.close();
  }
});

test('closing the window quits when PReview should not keep running', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.evaluate(() => window.preview.settings.update({ keepRunningOnClose: false }));

  // The app can quit before this call answers, so it isn't awaited.
  const closed = app.waitForEvent('close');
  void app
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
    .catch(() => {});
  await closed;
});

test('closing the window hides it, and PReview stays open until it quits', async () => {
  const app = await launch();
  await app.firstWindow();
  const windowState = () =>
    app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      return { count: windows.length, visible: windows[0]?.isVisible() };
    });

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await expect.poll(windowState).toEqual({ count: 1, visible: false });

  await app.evaluate(({ app: electronApp }) => electronApp.emit('activate'));
  await expect.poll(windowState).toEqual({ count: 1, visible: true });

  await app.close();
});
