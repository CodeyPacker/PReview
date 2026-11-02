import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
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

test('launches the app window', async () => {
  const app = await launch();
  const page = await app.firstWindow();

  await expect(page).toHaveTitle('PReview');
  expect(await page.evaluate(() => typeof (window as { require?: unknown }).require)).toBe(
    'undefined',
  );

  await app.close();
});

test('keeps a saved setting after a restart', async () => {
  let app = await launch();
  let page = await app.firstWindow();
  expect(await page.evaluate(() => window.preview.settings.getAll())).toEqual({
    theme: 'system',
    githubPromptDismissed: false,
    reviewLeader: 'Control',
  });
  await page.evaluate(() => window.preview.settings.update({ theme: 'dark' }));
  await app.close();

  app = await launch();
  page = await app.firstWindow();
  expect(await page.evaluate(() => window.preview.settings.getAll())).toEqual({
    theme: 'dark',
    githubPromptDismissed: false,
    reviewLeader: 'Control',
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
    theme: 'system',
    githubPromptDismissed: false,
    reviewLeader: 'Control',
  });

  await app.close();
});

test('opens on the dashboard and navigates from the sidebar', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await dismissGitHubPrompt(page);
  const nav = page.getByRole('navigation', { name: 'Main' });

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
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
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
  expect(await page.evaluate(() => window.preview.github.getAuth())).toEqual({
    status: 'disconnected',
  });
  await dismissGitHubPrompt(page);
  await app.close();

  app = await launch();
  page = await app.firstWindow();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
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
    const allFiles = files.getByRole('radio', { name: 'All', exact: true });
    const flaggedFiles = files.getByRole('radio', { name: 'Flagged', exact: true });
    const notApproved = files.getByRole('radio', { name: 'Unapproved', exact: true });
    const aRow = files.getByRole('button', { name: /a.ts/ });
    const newRow = files.getByTitle('new.ts', { exact: true });
    await expect(previousFile).toBeDisabled();
    await expect(allFiles).toBeChecked();
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

    await flaggedFiles.click();
    await expect(aRow).toBeVisible();
    await expect(newRow).toBeVisible();
    await aRow.click();
    await approve.click();
    await expect(title).toHaveText('new.ts');
    await expect(aRow).toHaveCount(0);
    await expect(newRow).toBeVisible();
    await expect(previousFile).toBeDisabled();
    await expect(nextFile).toBeDisabled();
    await notApproved.click();
    await expect(aRow).toHaveCount(0);
    await expect(newRow).toBeVisible();
    await approve.click();
    await expect(files.getByText('No files match this filter.')).toBeVisible();
    await expect(approve).toBeDisabled();
    await expect(flag).toBeDisabled();
    await allFiles.click();
    await expect(aRow).toHaveAttribute('data-review-state', 'approved');
    await expect(newRow).toHaveAttribute('data-review-state', 'approved');
    await previousFile.click();
    await removeApproval.click();
    await expect(title).toHaveText('a.ts');
    await expect(aRow).not.toHaveAttribute('data-review-state', 'approved');
    await notApproved.click();
    await expect(aRow).toBeVisible();
    await expect(newRow).toHaveCount(0);
    await flaggedFiles.click();
    await expect(files.getByText('No files match this filter.')).toBeVisible();
    await allFiles.click();
    await flag.click();
    await expect(title).toHaveText('new.ts');
    await page.reload();
    await expect(allFiles).toBeChecked();
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
          status: 'connected',
          user: { login: 'me', name: null, avatarUrl: 'https://avatars.githubusercontent.com/u/2' },
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
          const { verdict } = input as { verdict: string };
          return verdict === 'request-changes'
            ? { status: 'rejected', message: 'Pull request is locked.' }
            : { status: 'submitted' };
        },
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
    await page.getByRole('button', { name: 'Submit review' }).click();
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
    await page.getByRole('button', { name: 'Submit review' }).click();
    await expect(dialog.getByRole('radio', { name: 'Approve' })).toBeEnabled();
    await expect(dialog.getByRole('radio', { name: 'Approve' })).toBeChecked();
    await dialog.getByRole('radio', { name: 'Request changes' }).click();
    await dialog.getByLabel('Summary').fill('Needs work.');
    await dialog.getByRole('button', { name: 'Submit review' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Pull request is locked.');
    await expect(dialog.getByRole('button', { name: 'Submit review' })).toBeEnabled();
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
      // Monaco redraws line numbers after a layout change, so the measure is retried.
      let box: { x: number; y: number; height: number } | null = null;
      await expect.poll(async () => (box = await lineNumber(line).boundingBox())).not.toBeNull();
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
    await page.getByRole('button', { name: 'Submit review' }).click();
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

    await page.getByRole('button', { name: 'Finish review' }).click();
    const finished = page.getByRole('button', { name: 'Review finished' });
    await expect(finished).toBeDisabled();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Review finished' })).toBeDisabled();
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

    await page.getByRole('button', { name: 'Submit review' }).click();
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
      'pullRequestFiles.listCommits': [{ sha: commit, subject: 'Touch b', authorLogin: 'octo' }],
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
    await expect(page.getByRole('button', { name: 'Approve file', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Flag file', exact: true })).toBeDisabled();

    await files.getByRole('combobox', { name: 'Commit' }).click();
    await page.getByRole('option', { name: 'All changes' }).click();
    await expect(files.getByRole('button', { name: /a.ts/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve file', exact: true })).toBeEnabled();

    // Generated files wait for the reviewer.
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
