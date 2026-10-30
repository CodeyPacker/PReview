import { z } from 'zod';

export const themeSchema = z.enum(['system', 'light', 'dark']);

export const settingsSchema = z.strictObject({
  theme: themeSchema,
  // Set when the user closes the first-launch GitHub prompt without connecting.
  githubPromptDismissed: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const defaultSettings: Settings = {
  theme: 'system',
  githubPromptDismissed: false,
};
