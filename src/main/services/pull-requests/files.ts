import type { DatabaseSync } from 'node:sqlite';
import type {
  PullRequestChanges,
  PullRequestFileDiff,
} from '../../../shared/contracts/pull-request-files.ts';
import type { GitProvider } from '../../providers/types.ts';

// Files above this many characters are not sent to the renderer.
export const MAX_FILE_LENGTH = 1_000_000;
// How often to read the files again when the pull request changes while they are read.
const MAX_ATTEMPTS = 3;

export interface PullRequestFilesDeps {
  db: DatabaseSync;
  provider: GitProvider;
}

// Reads what a pull request changes from the provider, when a review asks for it. Nothing is
// cached here. The renderer holds the commits that list returned and sends them back for
// every file, so one review reads one snapshot.
export class PullRequestFiles {
  constructor(private readonly deps: PullRequestFilesDeps) {}

  // The files of the pull request as it is now, with the commits they are at.
  async list(pullRequestId: number): Promise<PullRequestChanges> {
    const { provider } = this.deps;
    const repository = this.findRepository(pullRequestId);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const before = await provider.getPullRequestRefs(repository.fullName, repository.number);
      const [files, mergeBase] = await Promise.all([
        provider.getPullRequestFiles(repository.fullName, repository.number),
        provider.getMergeBase(repository.fullName, before.baseBranch, before.headSha),
      ]);
      // A push or a new base branch during the reads would mix two snapshots. Read again.
      const after = await provider.getPullRequestRefs(repository.fullName, repository.number);
      if (after.headSha === before.headSha && after.baseBranch === before.baseBranch) {
        return { headSha: before.headSha, mergeBase, files };
      }
    }
    throw new Error('The pull request kept changing while its files were read. Try again.');
  }

  // The file before and after the pull request, at the commits list returned.
  async getDiff(
    pullRequestId: number,
    headSha: string,
    mergeBase: string,
    path: string,
    previousPath: string | null,
  ): Promise<PullRequestFileDiff> {
    const { fullName } = this.findRepository(pullRequestId);
    const [original, modified] = await Promise.all([
      this.deps.provider.getFileContent(fullName, previousPath ?? path, mergeBase),
      this.deps.provider.getFileContent(fullName, path, headSha),
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

  private findRepository(pullRequestId: number): { fullName: string; number: number } {
    const row = this.deps.db
      .prepare(
        `SELECT p.number, r.github_owner, r.github_name
         FROM pull_requests p
         JOIN repositories r ON r.id = p.repository_id
         WHERE p.id = ?`,
      )
      .get(pullRequestId) as
      { number: number; github_owner: string | null; github_name: string | null } | undefined;
    if (!row?.github_owner || !row.github_name) throw new Error('Pull request not found.');
    return { fullName: `${row.github_owner}/${row.github_name}`, number: row.number };
  }
}
