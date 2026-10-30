import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
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
  expect(await page.evaluate(() => window.preview.settings.getAll())).toEqual({ theme: 'system' });
  await page.evaluate(() => window.preview.settings.update({ theme: 'dark' }));
  await app.close();

  app = await launch();
  page = await app.firstWindow();
  expect(await page.evaluate(() => window.preview.settings.getAll())).toEqual({ theme: 'dark' });
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
  expect(await page.evaluate(() => window.preview.settings.getAll())).toEqual({ theme: 'system' });

  await app.close();
});
