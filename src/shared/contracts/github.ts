import { z } from 'zod';

export const githubUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string(),
});
export type GitHubUser = z.infer<typeof githubUserSchema>;

// The GitHub connection as the renderer sees it. Never includes the token.
// pending: the user has a code to enter on GitHub's device page.
// disconnected.error: why the last attempt or the stored connection failed.
export const githubAuthStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('disconnected'), error: z.string().optional() }),
  z.object({
    status: z.literal('pending'),
    userCode: z.string(),
    verificationUri: z.url(),
    expiresAt: z.iso.datetime(),
  }),
  z.object({ status: z.literal('connected'), user: githubUserSchema }),
]);
export type GitHubAuthState = z.infer<typeof githubAuthStateSchema>;
