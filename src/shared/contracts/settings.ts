import { z } from 'zod';

export const themeSchema = z.enum(['system', 'light', 'dark']);

export const settingsSchema = z.strictObject({
  theme: themeSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const defaultSettings: Settings = {
  theme: 'system',
};
