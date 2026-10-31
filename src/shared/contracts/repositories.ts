import { z } from 'zod';

export const DEFAULT_SCAN_DEPTH = 4;
export const MAX_SCAN_DEPTH = 8;

// How many folder levels below the watched root to search. 0 checks only the root.
export const scanDepthSchema = z.number().int().min(0).max(MAX_SCAN_DEPTH);

export const watchedFolderSchema = z.object({
  id: z.number().int(),
  path: z.string(),
  scanDepth: scanDepthSchema,
});
export type WatchedFolder = z.infer<typeof watchedFolderSchema>;

// unavailable: the repository was not found on the last scan. Its record is kept.
export const repositoryStatusSchema = z.enum(['available', 'unavailable']);
export type RepositoryStatus = z.infer<typeof repositoryStatusSchema>;

// What PReview does with the pull requests of a repository. All three start on.
export const repositorySettingsSchema = z.object({
  // Off pauses the repository: its pull requests stop syncing into the Inbox.
  monitored: z.boolean(),
  includeDrafts: z.boolean(),
  // Pull requests opened by bots and automated tools.
  includeAutomated: z.boolean(),
});
export type RepositorySettings = z.infer<typeof repositorySettingsSchema>;

export const repositorySettingsPatchSchema = repositorySettingsSchema.partial();
export type RepositorySettingsPatch = z.infer<typeof repositorySettingsPatchSchema>;

export const repositorySchema = z.object({
  id: z.number().int(),
  path: z.string(),
  name: z.string(),
  // The origin remote with any credentials removed.
  remoteUrl: z.string().nullable(),
  // Parsed from the origin remote. Null when origin is not a GitHub repository.
  github: z.object({ owner: z.string(), name: z.string() }).nullable(),
  status: repositoryStatusSchema,
  settings: repositorySettingsSchema,
});
export type Repository = z.infer<typeof repositorySchema>;

export const repositoriesStateSchema = z.object({
  repositories: z.array(repositorySchema),
  scanning: z.boolean(),
});
export type RepositoriesState = z.infer<typeof repositoriesStateSchema>;
