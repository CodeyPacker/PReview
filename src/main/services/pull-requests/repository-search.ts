import type { DatabaseSync } from 'node:sqlite';
import type {
  RepositorySearchInput,
  RepositorySearchResult,
} from '../../../shared/contracts/repository-search.ts';
import type { GitProvider } from '../../providers/types.ts';
import type { GitGrep } from '../repositories/git-grep.ts';
import type { Git } from '../repositories/git-info.ts';

export const MAX_MATCHES = 200;
const MATCHES_PER_FILE = 5;
const MAX_PREVIEW_LENGTH = 200;
// Without a local clone every file is a request, so only some are read.
const MAX_FILES_READ = 150;
const MAX_FILE_LENGTH = 1_000_000;
const READS_AT_ONCE = 6;
// Files that are not text, so reading them can't find anything.
const BINARY_EXTENSION =
  /\.(png|jpe?g|gif|webp|ico|icns|pdf|zip|gz|tgz|woff2?|ttf|otf|eot|mp[34]|mov|wasm|bin|lock)$/i;

interface Deps {
  db: DatabaseSync;
  provider: GitProvider;
  git: Git;
  grep: GitGrep;
}

interface Located {
  fullName: string;
  // The repository's folder on this machine, when it is there.
  clonePath: string | null;
}

// Text search in every file of the repository at a pull request's head commit. A local clone is
// searched with git. Without the commit there, the files are read from the provider instead.
export class RepositorySearch {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async search({
    pullRequestId,
    headSha,
    query,
  }: RepositorySearchInput): Promise<RepositorySearchResult> {
    const { fullName, clonePath } = this.locate(pullRequestId);
    if (clonePath && (await this.hasCommit(clonePath, headSha))) {
      return this.searchClone(clonePath, headSha, query);
    }
    return this.searchProvider(fullName, headSha, query);
  }

  private locate(pullRequestId: number): Located {
    const row = this.deps.db
      .prepare(
        `SELECT r.github_owner, r.github_name, r.path, r.status
         FROM pull_requests p
         JOIN repositories r ON r.id = p.repository_id
         WHERE p.id = ?`,
      )
      .get(pullRequestId) as
      | {
          github_owner: string | null;
          github_name: string | null;
          path: string;
          status: string;
        }
      | undefined;
    if (!row?.github_owner || !row.github_name) throw new Error('Pull request not found.');
    return {
      fullName: `${row.github_owner}/${row.github_name}`,
      clonePath: row.status === 'available' ? row.path : null,
    };
  }

  private async hasCommit(clonePath: string, sha: string): Promise<boolean> {
    try {
      await this.deps.git(clonePath, ['cat-file', '-e', `${sha}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }

  private async searchClone(
    clonePath: string,
    headSha: string,
    query: string,
  ): Promise<RepositorySearchResult> {
    // One more line than shown, to know whether there were more.
    const lines = await this.deps.grep(
      clonePath,
      [
        '-n',
        '-I',
        '-i',
        '-F',
        '--null',
        `--max-count=${MATCHES_PER_FILE}`,
        '-e',
        query,
        headSha,
        '--',
      ],
      MAX_MATCHES + 1,
    );
    // Each line is "<sha>:<path>", the line number and the text, split by null characters.
    const prefix = `${headSha}:`;
    const matches = lines.slice(0, MAX_MATCHES).flatMap((line) => {
      const [location, lineText, ...text] = line.split('\0');
      const lineNumber = Number(lineText);
      if (!location?.startsWith(prefix) || !Number.isInteger(lineNumber)) return [];
      return [
        {
          path: location.slice(prefix.length),
          line: lineNumber,
          preview: text.join('\0').trim().slice(0, MAX_PREVIEW_LENGTH),
        },
      ];
    });
    return { headSha, source: 'clone', matches, partial: lines.length > MAX_MATCHES };
  }

  private async searchProvider(
    fullName: string,
    headSha: string,
    query: string,
  ): Promise<RepositorySearchResult> {
    const { paths, truncated } = await this.deps.provider.getRepositoryFiles(fullName, headSha);
    const candidates = paths.filter((path) => !BINARY_EXTENSION.test(path));
    const toRead = candidates.slice(0, MAX_FILES_READ);
    const needle = query.toLowerCase();
    const matches: RepositorySearchResult['matches'] = [];
    let next = 0;
    const worker = async () => {
      while (next < toRead.length && matches.length < MAX_MATCHES) {
        const path = toRead[next++] as string;
        const text = await this.deps.provider.getFileContent(fullName, path, headSha).catch(() => {
          return undefined;
        });
        if (text === undefined || text.length > MAX_FILE_LENGTH || text.includes('\0')) continue;
        let found = 0;
        for (const [index, line] of text.split('\n').entries()) {
          if (!line.toLowerCase().includes(needle)) continue;
          matches.push({
            path,
            line: index + 1,
            preview: line.trim().slice(0, MAX_PREVIEW_LENGTH),
          });
          if (++found >= MATCHES_PER_FILE) break;
        }
      }
    };
    await Promise.all(Array.from({ length: READS_AT_ONCE }, worker));
    matches.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    return {
      headSha,
      source: 'github',
      matches: matches.slice(0, MAX_MATCHES),
      partial: truncated || candidates.length > toRead.length || matches.length > MAX_MATCHES,
    };
  }
}
