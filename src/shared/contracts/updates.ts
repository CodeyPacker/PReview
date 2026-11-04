import { z } from 'zod';

// Where updates stand. unsupported: a development build, which never updates. idle: no check
// has found a newer version. available: a newer version this platform can't install by itself,
// so the user downloads it from url. ready: downloaded, and installed on the next restart.
export const updateStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unsupported') }),
  z.object({ status: z.literal('idle') }),
  z.object({ status: z.literal('checking') }),
  z.object({ status: z.literal('available'), version: z.string(), url: z.string() }),
  z.object({ status: z.literal('downloading'), version: z.string(), percent: z.number() }),
  z.object({ status: z.literal('ready'), version: z.string() }),
  z.object({ status: z.literal('error'), message: z.string() }),
]);
export type UpdateState = z.infer<typeof updateStateSchema>;

// busy: an agent is running, so PReview won't restart yet.
export const installUpdateResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('restarting') }),
  z.object({ status: z.literal('busy') }),
  z.object({ status: z.literal('not-ready') }),
]);
export type InstallUpdateResult = z.infer<typeof installUpdateResultSchema>;
