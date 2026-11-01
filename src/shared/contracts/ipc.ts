import { z } from 'zod';
import { githubAuthStateSchema } from './github.ts';
import {
  repositoriesStateSchema,
  repositorySettingsPatchSchema,
  scanDepthSchema,
  watchedFolderSchema,
} from './repositories.ts';
import {
  commitShaSchema,
  pullRequestChangesSchema,
  pullRequestFileDiffSchema,
} from './pull-request-files.ts';
import { submitReviewInputSchema, submitReviewResultSchema } from './pull-request-reviews.ts';
import { pullRequestsStateSchema } from './pull-requests.ts';
import { settingsPatchSchema, settingsSchema } from './settings.ts';

export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.enum(['darwin', 'win32', 'linux']),
  electronVersion: z.string(),
});
export type AppInfo = z.infer<typeof appInfoSchema>;

// Every IPC channel and the schemas its input and output must match.
// The main process validates both sides; the preload exposes one function per channel.
export const ipcContract = {
  'app.getInfo': { input: z.undefined(), output: appInfoSchema },
  'settings.getAll': { input: z.undefined(), output: settingsSchema },
  'settings.update': { input: settingsPatchSchema, output: settingsSchema },
  'github.getAuth': { input: z.undefined(), output: githubAuthStateSchema },
  'github.connect': { input: z.undefined(), output: githubAuthStateSchema },
  'github.cancel': { input: z.undefined(), output: githubAuthStateSchema },
  'github.disconnect': { input: z.undefined(), output: githubAuthStateSchema },
  'folders.list': { input: z.undefined(), output: z.array(watchedFolderSchema) },
  // Opens the native folder picker. A canceled picker changes nothing.
  'folders.add': { input: z.undefined(), output: z.array(watchedFolderSchema) },
  'folders.setScanDepth': {
    input: z.object({ id: z.number().int(), scanDepth: scanDepthSchema }),
    output: z.array(watchedFolderSchema),
  },
  'folders.remove': {
    input: z.object({ id: z.number().int() }),
    output: z.array(watchedFolderSchema),
  },
  'repositories.list': { input: z.undefined(), output: repositoriesStateSchema },
  // Starts a scan and returns without waiting for it.
  'repositories.scan': { input: z.undefined(), output: repositoriesStateSchema },
  'repositories.updateSettings': {
    input: z.object({ id: z.number().int(), patch: repositorySettingsPatchSchema }),
    output: repositoriesStateSchema,
  },
  'pullRequests.list': { input: z.undefined(), output: pullRequestsStateSchema },
  // Starts a sync and returns without waiting for it.
  'pullRequests.refresh': { input: z.undefined(), output: pullRequestsStateSchema },
  // The files a pull request changes, read from the provider, with the commits they are at.
  'pullRequestFiles.list': {
    input: z.object({ pullRequestId: z.number().int() }),
    output: pullRequestChangesSchema,
  },
  // One file at the commits that list returned.
  'pullRequestFiles.getDiff': {
    input: z.object({
      pullRequestId: z.number().int(),
      headSha: commitShaSchema,
      mergeBase: commitShaSchema,
      path: z.string(),
      previousPath: z.string().nullable(),
    }),
    output: pullRequestFileDiffSchema,
  },
  // Publishes a review to the provider.
  'pullRequestReviews.submit': {
    input: submitReviewInputSchema,
    output: submitReviewResultSchema,
  },
} satisfies Record<string, { input: z.ZodType; output: z.ZodType }>;

export type IpcChannel = keyof typeof ipcContract;
export type IpcInput<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['output']>;
