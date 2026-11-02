import { z } from 'zod';
import { commitShaSchema } from './pull-request-files.ts';

export const repositorySearchInputSchema = z.object({
  pullRequestId: z.number().int(),
  headSha: commitShaSchema,
  query: z.string().trim().min(2).max(200),
});
export type RepositorySearchInput = z.infer<typeof repositorySearchInputSchema>;

export const repositorySearchMatchSchema = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  // The matching line's text, trimmed.
  preview: z.string(),
});
export type RepositorySearchMatch = z.infer<typeof repositorySearchMatchSchema>;

// Matches in every file of the repository at the pull request's head.
export const repositorySearchResultSchema = z.object({
  headSha: commitShaSchema,
  // clone: searched with git in the local clone. github: read file by file from GitHub, which
  // only reaches some of them.
  source: z.enum(['clone', 'github']),
  matches: z.array(repositorySearchMatchSchema),
  // Not every match or file is here: the results hit their limit or some files were not read.
  partial: z.boolean(),
});
export type RepositorySearchResult = z.infer<typeof repositorySearchResultSchema>;
