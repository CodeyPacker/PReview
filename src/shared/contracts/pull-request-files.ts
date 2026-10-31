import { z } from 'zod';

export const pullRequestFileSchema = z.object({
  path: z.string(),
  // The path before a rename or copy.
  previousPath: z.string().nullable(),
  status: z.enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed']),
  additions: z.number().int(),
  deletions: z.number().int(),
});
export type PullRequestFile = z.infer<typeof pullRequestFileSchema>;

export const pullRequestFileDiffSchema = z.object({
  // The file's text before and after the pull request. Empty for an added or removed side.
  original: z.string(),
  modified: z.string(),
  // Why the text is empty when the file has content that cannot be shown.
  unavailable: z.enum(['binary', 'too-large']).nullable(),
});
export type PullRequestFileDiff = z.infer<typeof pullRequestFileDiffSchema>;
