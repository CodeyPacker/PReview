import { z } from 'zod';
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
} satisfies Record<string, { input: z.ZodType; output: z.ZodType }>;

export type IpcChannel = keyof typeof ipcContract;
export type IpcInput<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['output']>;
