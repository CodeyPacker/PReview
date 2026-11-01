import { z } from 'zod';

// One part of a file's diff as the provider shows it: changed lines and the context around
// them. A side with a count of 0 has no lines in the hunk.
export const diffHunkSchema = z.object({
  originalStart: z.number().int().nonnegative(),
  originalCount: z.number().int().nonnegative(),
  modifiedStart: z.number().int().nonnegative(),
  modifiedCount: z.number().int().nonnegative(),
});
export type DiffHunk = z.infer<typeof diffHunkSchema>;

export const pullRequestFileSchema = z.object({
  path: z.string(),
  // The path before a rename or copy.
  previousPath: z.string().nullable(),
  status: z.enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed']),
  additions: z.number().int(),
  deletions: z.number().int(),
  // Line comments go inside these. null when the provider shows no diff for the file, for
  // example when it is too large.
  hunks: z.array(diffHunkSchema).nullable(),
});
export type PullRequestFile = z.infer<typeof pullRequestFileSchema>;

// A commit id as the renderer sends it back. Checked, because it goes into a request URL.
export const commitShaSchema = z.string().regex(/^[0-9a-f]{7,64}$/);

// The files of a pull request at one pair of commits. getDiff reads the same commits, so the
// list and every diff agree even when the pull request changes while the review is open.
export const pullRequestChangesSchema = z.object({
  headSha: commitShaSchema,
  // The commit the pull request branched from, which the diff is taken against.
  mergeBase: commitShaSchema,
  files: z.array(pullRequestFileSchema),
});
export type PullRequestChanges = z.infer<typeof pullRequestChangesSchema>;

export const pullRequestFileDiffSchema = z.object({
  // The file's text before and after the pull request. Empty for an added or removed side.
  original: z.string(),
  modified: z.string(),
  // Why the text is empty when the file has content that cannot be shown.
  unavailable: z.enum(['binary', 'too-large']).nullable(),
  // Set for image files, which are shown instead of diffed. Each side is a data URL, or null
  // when the image does not exist at that commit.
  images: z.object({ original: z.string().nullable(), modified: z.string().nullable() }).nullable(),
});
export type PullRequestFileDiff = z.infer<typeof pullRequestFileDiffSchema>;
