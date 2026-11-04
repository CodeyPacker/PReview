import { z } from 'zod';

export const githubUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string(),
});
export type GitHubUser = z.infer<typeof githubUserSchema>;

// Where the token comes from. oauth: PReview's own device flow, stored by PReview.
// cli: the GitHub CLI's account, read from gh on each request.
export const githubAuthSourceSchema = z.enum(['oauth', 'cli']);
export type GitHubAuthSource = z.infer<typeof githubAuthSourceSchema>;

export const githubAccountSchema = githubUserSchema.extend({ source: githubAuthSourceSchema });
export type GitHubAccountInfo = z.infer<typeof githubAccountSchema>;

// The GitHub connections as the renderer sees them. Never includes a token.
// accounts: every connected account, in login order.
// pending: the user has a code to enter on GitHub's device page.
// connected: the account the last connect added. replaced: it was connected already.
// error: why the last attempt or a stored account failed.
export const githubAuthStateSchema = z.object({
  accounts: z.array(githubAccountSchema),
  pending: z
    .object({
      userCode: z.string(),
      verificationUri: z.url(),
      expiresAt: z.iso.datetime(),
    })
    .optional(),
  connected: z.object({ login: z.string(), replaced: z.boolean() }).optional(),
  error: z.string().optional(),
});
export type GitHubAuthState = z.infer<typeof githubAuthStateSchema>;
