import { z } from 'zod';

export const themeSchema = z.enum(['system', 'light', 'dark']);

export const accentSchema = z.enum(['purple', 'blue', 'teal', 'amber', 'coral', 'pink']);
export type Accent = z.infer<typeof accentSchema>;

export const densitySchema = z.enum(['compact', 'default', 'comfortable']);
export type Density = z.infer<typeof densitySchema>;

export const fontSizeSchema = z.enum(['small', 'default', 'large']);
export type FontSize = z.infer<typeof fontSizeSchema>;

export const reviewLeaderSchema = z.enum([
  'Control',
  'Alt',
  'Meta',
  'Control+Shift',
  'Alt+Shift',
  'Meta+Shift',
]);
export type ReviewLeader = z.infer<typeof reviewLeaderSchema>;

// Passed to Claude Code as model aliases, so they stay current. 'default' uses Claude Code's own.
export const agentModelSchema = z.enum(['default', 'fable', 'opus', 'sonnet', 'haiku']);
export type AgentModel = z.infer<typeof agentModelSchema>;

export const settingsSchema = z.strictObject({
  theme: themeSchema,
  accent: accentSchema,
  density: densitySchema,
  fontSize: fontSizeSchema,
  reviewLeader: reviewLeaderSchema,
  // Set when the user closes the first-launch GitHub prompt without connecting.
  githubPromptDismissed: z.boolean(),
  // The WSL distribution agents run in on Windows.
  wslDistro: z.string().trim().min(1).max(100),
  // Agents that may run at once.
  agentLimit: z.number().int().min(1).max(5),
  agentModel: agentModelSchema,
  // The changed files list puts tests, stories and generated files in a collapsed group.
  groupSupportFiles: z.boolean(),
  // Desktop notifications for each kind of event. They still go to the in-app list when off.
  notifyPullRequests: z.boolean(),
  notifyAgents: z.boolean(),
  notifyAchievements: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const defaultSettings: Settings = {
  theme: 'system',
  accent: 'purple',
  density: 'default',
  fontSize: 'default',
  reviewLeader: 'Control',
  githubPromptDismissed: false,
  wslDistro: 'Ubuntu',
  agentLimit: 2,
  agentModel: 'default',
  groupSupportFiles: true,
  notifyPullRequests: true,
  notifyAgents: true,
  notifyAchievements: true,
};
