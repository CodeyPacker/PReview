// Mocks for the review page. The mocked pull request is not in the database, so the tests
// answer the app's requests in the main process instead.
import type { ElectronApplication, Page } from '@playwright/test';

// The answer to 'pullRequests.list': one open pull request, id 1, at head abcdef1.
export function pullRequestsState(title: string) {
  return {
    pullRequests: [
      {
        id: 1,
        repositoryId: 1,
        number: 7,
        title,
        draft: false,
        url: 'https://github.com/octo/app/pull/7',
        author: null,
        headBranch: 'feature',
        headSha: 'abcdef1',
        baseBranch: 'main',
        createdAt: '2026-10-31T12:00:00Z',
        updatedAt: '2026-10-31T12:00:00Z',
      },
    ],
    errors: [],
    syncing: false,
  };
}

// A file the pull request modifies, with no hunks to comment inside.
export function changedFile(path: string) {
  return {
    path,
    blobSha: `sha-${path}`,
    previousPath: null,
    status: 'modified',
    additions: 1,
    deletions: 1,
    hunks: null,
  };
}

// Answers each channel with a fixed value. Later calls replace earlier ones.
export async function mockIpc(
  app: ElectronApplication,
  responses: Record<string, unknown>,
): Promise<void> {
  await app.evaluate(({ ipcMain }, channels) => {
    for (const [channel, response] of Object.entries(channels)) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => response);
    }
  }, responses);
}

// File marks are kept in memory.
export async function mockFileReviewMarks(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    let marks: { path: string; state: string | null; blobSha: string }[] = [];
    ipcMain.removeHandler('fileReviewMarks.list');
    ipcMain.handle('fileReviewMarks.list', () => marks);
    ipcMain.removeHandler('fileReviewMarks.set');
    ipcMain.handle('fileReviewMarks.set', (_event, mark: (typeof marks)[number]) => {
      marks = marks.filter((saved) => saved.path !== mark.path);
      if (mark.state) marks.push(mark);
      return marks;
    });
  });
}

// Opens the review of the mocked pull request.
export async function openReview(app: ElectronApplication, page: Page): Promise<void> {
  await mockFileReviewMarks(app);
  await page.evaluate(() => {
    location.hash = '/review/1';
  });
  // The sidebar read the pull requests before they were mocked.
  await page.reload();
}

// The answer to 'pullRequestFiles.getDiff': one changed line.
export const changedLine = {
  original: 'const a = 1;\n',
  modified: 'const a = 2;\n',
  unavailable: null,
};

// Two rounds: the first was submitted, so the second reviews the changes since baselineSha.
export function reReviewRounds(baselineSha: string) {
  return [
    {
      number: 1,
      headSha: 'd'.repeat(40),
      baselineSha: null,
      startedAt: '2026-11-01T11:00:00.000Z',
      submittedAt: '2026-11-01T12:00:00.000Z',
      finishedAt: null,
    },
    {
      number: 2,
      headSha: 'abcdef1',
      baselineSha,
      startedAt: '2026-11-02T11:00:00.000Z',
      submittedAt: null,
      finishedAt: null,
    },
  ];
}

// The second round of a review: a.ts and b.ts changed, and only b.ts since the first round.
// extra answers more channels or replaces these answers.
export async function mockReReview(
  app: ElectronApplication,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const baseline = 'c'.repeat(40);
  await mockIpc(app, {
    'pullRequestFiles.list': {
      headSha: 'abcdef1',
      mergeBase: 'abcdef0',
      files: [changedFile('a.ts'), changedFile('b.ts')],
    },
    'pullRequestFiles.listCommits': [
      { sha: 'e'.repeat(40), subject: 'Touch b', authorLogin: 'octo' },
    ],
    'pullRequestFiles.listSince': {
      headSha: 'abcdef1',
      mergeBase: baseline,
      files: [changedFile('b.ts')],
    },
    'pullRequestFiles.getDiff': changedLine,
    'reviewRounds.sync': reReviewRounds(baseline),
    ...extra,
  });
}
