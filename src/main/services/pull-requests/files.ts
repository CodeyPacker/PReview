import type { DatabaseSync } from 'node:sqlite';
import type {
  PullRequestFile,
  PullRequestFileDiff,
} from '../../../shared/contracts/pull-request-files.ts';
import type { GitProvider } from '../../providers/types.ts';

// Files above this many characters are not sent to the renderer.
export const MAX_FILE_LENGTH = 1_000_000;

interface PullRequestTarget {
  fullName: string;
  number: number;
  headSha: string;
  baseBranch: string;
}

export interface PullRequestFilesDeps {
  db: DatabaseSync;
  provider: GitProvider;
}

// Reads what a pull request changes from the provider, when a review asks for it.
export class PullRequestFiles {
  // Merge bases by pull request and head commit. A merge base never changes for a head commit.
  private readonly mergeBases = new Map<string, string>();

  constructor(private readonly deps: PullRequestFilesDeps) {}

  async list(pullRequestId: number): Promise<PullRequestFile[]> {
    const target = this.find(pullRequestId);
    return this.deps.provider.getPullRequestFiles(target.fullName, target.number);
  }

  // The file before and after the pull request. Before is the merge base, because that is
  // what the pull request's diff is taken against.
  async getDiff(
    pullRequestId: number,
    path: string,
    previousPath: string | null,
  ): Promise<PullRequestFileDiff> {
    const target = this.find(pullRequestId);
    const mergeBase = await this.getMergeBase(pullRequestId, target);
    const [original, modified] = await Promise.all([
      this.deps.provider.getFileContent(target.fullName, previousPath ?? path, mergeBase),
      this.deps.provider.getFileContent(target.fullName, path, target.headSha),
    ]);
    const texts = [original ?? '', modified ?? ''];
    if (texts.some((text) => text.includes('\0'))) {
      return { original: '', modified: '', unavailable: 'binary' };
    }
    if (texts.some((text) => text.length > MAX_FILE_LENGTH)) {
      return { original: '', modified: '', unavailable: 'too-large' };
    }
    return { original: texts[0] ?? '', modified: texts[1] ?? '', unavailable: null };
  }

  private async getMergeBase(pullRequestId: number, target: PullRequestTarget): Promise<string> {
    const key = `${pullRequestId}:${target.headSha}`;
    const known = this.mergeBases.get(key);
    if (known) return known;
    const mergeBase = await this.deps.provider.getMergeBase(
      target.fullName,
      target.baseBranch,
      target.headSha,
    );
    this.mergeBases.set(key, mergeBase);
    return mergeBase;
  }

  private find(pullRequestId: number): PullRequestTarget {
    const row = this.deps.db
      .prepare(
        `SELECT p.number, p.head_sha, p.base_branch, r.github_owner, r.github_name
         FROM pull_requests p
         JOIN repositories r ON r.id = p.repository_id
         WHERE p.id = ?`,
      )
      .get(pullRequestId) as
      | {
          number: number;
          head_sha: string;
          base_branch: string;
          github_owner: string | null;
          github_name: string | null;
        }
      | undefined;
    if (!row?.github_owner || !row.github_name) throw new Error('Pull request not found.');
    return {
      fullName: `${row.github_owner}/${row.github_name}`,
      number: row.number,
      headSha: row.head_sha,
      baseBranch: row.base_branch,
    };
  }
}
