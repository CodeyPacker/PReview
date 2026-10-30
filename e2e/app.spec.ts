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

// Each test gets its own user-data folder, so it starts with an empty database.
let userDataDir: string;

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'preview-e2e-'));
});

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

function launch(): Promise<ElectronApplication> {
  return electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`] });
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
  });
  await page.evaluate(() => window.preview.settings.update({ theme: 'dark' }));
  await app.close();

  app = await launch();
  page = await app.firstWindow();
  expect(await page.evaluate(() => window.preview.settings.getAll())).toEqual({
    theme: 'dark',
    githubPromptDismissed: false,
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
    await expect(page.getByText('octo/hello')).toBeVisible();
    await expect(page.getByText(hello, { exact: true })).toBeVisible();
    await expect(page.getByText('Available')).toBeVisible();

    await page.getByRole('button', { name: `Remove ${code}` }).click();
    await expect(page.getByText('No folders yet')).toBeVisible();
    await expect(page.getByText('Unavailable')).toBeVisible();
    await app.close();
  } finally {
    rmSync(code, { recursive: true, force: true });
  }
});
