import type { DatabaseSync } from 'node:sqlite';
import type { PullRequest, ReviewState } from '../../../shared/contracts/pull-requests.ts';
import { transaction } from '../../database/connection.ts';
import type { ProviderPullRequest } from '../../providers/types.ts';

interface PullRequestRow {
  id: number;
  repository_id: number;
  number: number;
  title: string;
  draft: number;
  url: string;
  author_login: string | null;
  author_avatar_url: string | null;
  author_is_bot: number;
  head_branch: string;
  head_sha: string;
  base_branch: string;
  created_at: string;
  updated_at: string;
  opened: number;
  has_drafts: number;
  submitted_head_sha: string | null;
  finished_at: string | null;
  agent_ci: 'pending' | 'passed' | 'failed' | null;
}

// The latest round decides: a submitted review waits for new commits, then for the next
// round, and a finished one is done. Before a submit, unsent drafts mean feedback is in the
// making. New commits an agent pushed wait for their CI first, and failed CI needs action.
export function reviewStateOf(row: {
  opened: boolean;
  hasDrafts: boolean;
  headSha: string;
  submittedHeadSha: string | null;
  finishedAt: string | null;
  // CI on the head commit, when an agent pushed it.
  agentCi?: 'pending' | 'passed' | 'failed' | null;
}): ReviewState {
  if (row.submittedHeadSha !== null && row.submittedHeadSha !== row.headSha) {
    if (row.agentCi === 'pending') return 'feedback-submitted';
    if (row.agentCi === 'failed') return 'action-required';
    return 'ready-for-rereview';
  }
  if (row.finishedAt !== null) return 'completed';
  if (row.submittedHeadSha !== null) return 'feedback-submitted';
  if (row.hasDrafts) return 'draft-feedback';
  return row.opened ? 'in-progress' : 'needs-review';
}

// The open pull requests of monitored, available repositories, newest activity first.
// Leaves out drafts and automated pull requests where the repository's settings do.
export function listPullRequests(db: DatabaseSync): PullRequest[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.repository_id, p.number, p.title, p.draft, p.url, p.author_login,
              p.author_avatar_url, p.author_is_bot, p.head_branch, p.head_sha, p.base_branch, p.created_at,
              p.updated_at, s.pull_request_id IS NOT NULL AS opened,
              EXISTS (SELECT 1 FROM review_drafts d WHERE d.pull_request_id = p.id) AS has_drafts,
              rr.submitted_head_sha, rr.finished_at,
              (SELECT t.ci_status FROM agent_tasks t
               WHERE t.pull_request_id = p.id AND t.pushed_sha = p.head_sha
               ORDER BY t.id DESC LIMIT 1) AS agent_ci
       FROM pull_requests p
       JOIN repositories r ON r.id = p.repository_id
       LEFT JOIN review_sessions s ON s.pull_request_id = p.id
       LEFT JOIN review_rounds rr ON rr.pull_request_id = p.id
         AND rr.number = (SELECT MAX(number) FROM review_rounds WHERE pull_request_id = p.id)
       WHERE r.monitored = 1 AND r.status = 'available'
         AND (r.include_drafts = 1 OR p.draft = 0)
         AND (r.include_automated = 1 OR p.author_is_bot = 0)
       ORDER BY p.updated_at DESC, p.id`,
    )
    .all() as unknown as PullRequestRow[];
  return rows.map((row) => ({
    id: row.id,
    repositoryId: row.repository_id,
    number: row.number,
    title: row.title,
    draft: row.draft === 1,
    url: row.url,
    author:
      row.author_login && row.author_avatar_url
        ? {
            login: row.author_login,
            avatarUrl: row.author_avatar_url,
            bot: row.author_is_bot === 1,
          }
        : null,
    headBranch: row.head_branch,
    headSha: row.head_sha,
    baseBranch: row.base_branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    opened: row.opened === 1,
    reviewState: reviewStateOf({
      opened: row.opened === 1,
      hasDrafts: row.has_drafts === 1,
      headSha: row.head_sha,
      submittedHeadSha: row.submitted_head_sha,
      finishedAt: row.finished_at,
      agentCi: row.agent_ci,
    }),
  }));
}

// Makes the stored pull requests of one repository match a full listing from the
// provider: updates and adds what is open and deletes what is not.
export function replacePullRequests(
  db: DatabaseSync,
  repositoryId: number,
  pullRequests: readonly ProviderPullRequest[],
): void {
  const upsert = db.prepare(`
    INSERT INTO pull_requests
      (repository_id, provider_id, number, title, draft, url, author_login, author_avatar_url,
       author_is_bot, head_branch, head_sha, base_branch, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (repository_id, number) DO UPDATE SET
      provider_id = excluded.provider_id, title = excluded.title, draft = excluded.draft,
      url = excluded.url, author_login = excluded.author_login,
      author_avatar_url = excluded.author_avatar_url, author_is_bot = excluded.author_is_bot,
      head_branch = excluded.head_branch,
      head_sha = excluded.head_sha, base_branch = excluded.base_branch,
      created_at = excluded.created_at, updated_at = excluded.updated_at
  `);
  const prune = db.prepare(`
    DELETE FROM pull_requests
    WHERE repository_id = ? AND number NOT IN (SELECT value FROM json_each(?))
  `);

  transaction(db, () => {
    for (const pull of pullRequests) {
      upsert.run(
        repositoryId,
        pull.providerId,
        pull.number,
        pull.title,
        Number(pull.draft),
        pull.url,
        pull.author?.login ?? null,
        pull.author?.avatarUrl ?? null,
        Number(pull.author?.bot ?? false),
        pull.headBranch,
        pull.headSha,
        pull.baseBranch,
        pull.createdAt,
        pull.updatedAt,
      );
    }
    prune.run(repositoryId, JSON.stringify(pullRequests.map((pull) => pull.number)));
  });
}
