import { z } from 'zod';

export const themeSchema = z.enum(['system', 'light', 'dark']);

export const reviewLeaderSchema = z.enum([
  'Control',
  'Alt',
  'Meta',
  'Control+Shift',
  'Alt+Shift',
  'Meta+Shift',
]);
export type ReviewLeader = z.infer<typeof reviewLeaderSchema>;

export const settingsSchema = z.strictObject({
  theme: themeSchema,
  reviewLeader: reviewLeaderSchema,
  // Set when the user closes the first-launch GitHub prompt without connecting.
  githubPromptDismissed: z.boolean(),
  // The WSL distribution agents run in on Windows.
  wslDistro: z.string().trim().min(1).max(100),
  // The changed files list puts tests, stories and generated files in a collapsed group.
  groupSupportFiles: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const defaultSettings: Settings = {
  theme: 'system',
  reviewLeader: 'Control',
  githubPromptDismissed: false,
  wslDistro: 'Ubuntu',
  groupSupportFiles: true,
};
