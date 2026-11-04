export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Append only. Never edit a migration that has shipped; add a new one instead.
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'settings',
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: 'watched_folders_and_repositories',
    sql: `
      CREATE TABLE watched_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        scan_depth INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      -- A repository is identified by its root commit and origin remote, not its path,
      -- so a moved repository can be reconnected. status is 'available' or 'unavailable'.
      CREATE TABLE repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        remote_url TEXT,
        github_owner TEXT,
        github_name TEXT,
        root_commit TEXT,
        status TEXT NOT NULL CHECK (status IN ('available', 'unavailable')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX repositories_root_commit ON repositories (root_commit);
    `,
  },
  {
    version: 3,
    name: 'repository_path_unique_while_available',
    // A repository replaced by an unrelated one at the same path stays as an unavailable
    // record under that path, so only available repositories need unique paths. SQLite
    // can't drop a column constraint, so the table is rebuilt.
    sql: `
      CREATE TABLE repositories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        remote_url TEXT,
        github_owner TEXT,
        github_name TEXT,
        root_commit TEXT,
        status TEXT NOT NULL CHECK (status IN ('available', 'unavailable')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      INSERT INTO repositories_new
        (id, path, name, remote_url, github_owner, github_name, root_commit, status,
         created_at, last_seen_at)
      SELECT id, path, name, remote_url, github_owner, github_name, root_commit, status,
             created_at, last_seen_at
      FROM repositories;

      DROP TABLE repositories;
      ALTER TABLE repositories_new RENAME TO repositories;

      CREATE INDEX repositories_root_commit ON repositories (root_commit);
      CREATE INDEX repositories_path ON repositories (path);
      CREATE UNIQUE INDEX repositories_available_path ON repositories (path)
        WHERE status = 'available';
    `,
  },
  {
    version: 4,
    name: 'repository_settings',
    // Settings sit on the repository row. A reconnected repository keeps its row, so it
    // keeps its settings.
    sql: `
      ALTER TABLE repositories ADD COLUMN monitored INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE repositories ADD COLUMN include_drafts INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE repositories ADD COLUMN include_automated INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    version: 5,
    name: 'pull_requests',
    // Open pull requests as the last sync saw them. A pull request that closes is deleted
    // from here on the next sync.
    sql: `
      CREATE TABLE pull_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
        provider_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        draft INTEGER NOT NULL,
        url TEXT NOT NULL,
        author_login TEXT,
        author_avatar_url TEXT,
        head_branch TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (repository_id, number)
      ) STRICT;
    `,
  },
  {
    version: 6,
    name: 'pull_request_author_bot',
    // Rows from before this column read as written by a person until the next sync.
    sql: `
      ALTER TABLE pull_requests ADD COLUMN author_is_bot INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 7,
    name: 'review_drafts',
    // Comments on diff lines that have not been sent. A draft is anchored to the commits of
    // the diff it was written on. side is 'original' for the old file and 'modified' for the
    // new one. Drafts go with their pull request when it closes.
    sql: `
      CREATE TABLE review_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pull_request_id INTEGER NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
        head_sha TEXT NOT NULL,
        merge_base TEXT NOT NULL,
        path TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('original', 'modified')),
        line INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX review_drafts_pull_request ON review_drafts (pull_request_id);
    `,
  },
  {
    version: 8,
    name: 'review_draft_ranges',
    // A comment on several lines runs from start_line to line. Null for one line.
    sql: `
      ALTER TABLE review_drafts ADD COLUMN start_line INTEGER
        CHECK (start_line IS NULL OR start_line < line);
    `,
  },
  {
    version: 9,
    name: 'review_findings',
    // Problems with a pull request that aren't tied to a code line. steps is empty when there
    // are none. published_at is null until the finding goes out with a review. Findings go
    // with their pull request when it closes.
    sql: `
      CREATE TABLE review_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pull_request_id INTEGER NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
        category TEXT NOT NULL
          CHECK (category IN ('bug', 'ui-bug', 'security', 'improvement', 'test')),
        description TEXT NOT NULL,
        steps TEXT NOT NULL DEFAULT '',
        validation TEXT NOT NULL DEFAULT 'pending'
          CHECK (validation IN ('pending', 'validated', 'rejected')),
        resolution TEXT NOT NULL DEFAULT 'open' CHECK (resolution IN ('open', 'resolved')),
        published_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX review_findings_pull_request ON review_findings (pull_request_id);
    `,
  },
  {
    version: 10,
    name: 'review_sessions',
    // Where the reviewer left off in each pull request. selected_path is null until a file is
    // shown. scroll_top is the selected file's scroll position in pixels. At most one session
    // is active: the review open when the app last closed.
    sql: `
      CREATE TABLE review_sessions (
        pull_request_id INTEGER PRIMARY KEY REFERENCES pull_requests (id) ON DELETE CASCADE,
        selected_path TEXT,
        scroll_top INTEGER NOT NULL DEFAULT 0 CHECK (scroll_top >= 0),
        diff_mode TEXT NOT NULL DEFAULT 'split' CHECK (diff_mode IN ('split', 'unified')),
        active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE UNIQUE INDEX review_sessions_active ON review_sessions (active) WHERE active = 1;
    `,
  },
  {
    version: 11,
    name: 'file_review_marks',
    // A file the reviewer approved or flagged. blob_sha is the file's id when it was marked, so
    // the mark stops applying once the file changes.
    sql: `
      CREATE TABLE file_review_marks (
        pull_request_id INTEGER NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('approved', 'flagged')),
        blob_sha TEXT NOT NULL,
        PRIMARY KEY (pull_request_id, path)
      ) STRICT;
    `,
  },
  {
    version: 12,
    name: 'review_completions',
    // A pull request the reviewer finished reviewing. One row per pull request, so finishing
    // again changes nothing and the completion is counted once.
    sql: `
      CREATE TABLE review_completions (
        pull_request_id INTEGER PRIMARY KEY REFERENCES pull_requests (id) ON DELETE CASCADE,
        completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;
    `,
  },
  {
    version: 13,
    name: 'review_rounds',
    // One pass over a pull request. A round ends when its review is submitted, and the next
    // new commit starts the following round. head_sha is the head the round opened on.
    // baseline_sha is the head the previous round was submitted at, null for the first round.
    // finished_at is when the reviewer finished the round.
    sql: `
      CREATE TABLE review_rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pull_request_id INTEGER NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
        number INTEGER NOT NULL CHECK (number >= 1),
        head_sha TEXT NOT NULL,
        baseline_sha TEXT,
        started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        submitted_head_sha TEXT,
        submitted_at TEXT,
        finished_at TEXT,
        UNIQUE (pull_request_id, number)
      ) STRICT;
    `,
  },
  {
    version: 14,
    name: 'review_draft_outdated',
    // A draft whose lines changed in newer commits, so it can't be placed on them for sure.
    // It stays on its file at its old line, and it is never sent.
    sql: `
      ALTER TABLE review_drafts ADD COLUMN outdated INTEGER NOT NULL DEFAULT 0
        CHECK (outdated IN (0, 1));
    `,
  },
  {
    version: 15,
    name: 'review_session_view',
    // The changes the reviewer chose to look at: 'all', 'since-review' or a commit sha. Null
    // until they pick, so a re-review opens on the changes since the last one.
    sql: `
      ALTER TABLE review_sessions ADD COLUMN view TEXT;
    `,
  },
  {
    version: 16,
    name: 'review_submissions_and_agent_tasks',
    // A review on its way to GitHub. It is saved before sending, and its id goes in the body,
    // so after a crash or lost connection PReview can tell whether GitHub already has it.
    // comments keeps the published drafts as JSON, since the drafts themselves are deleted.
    // An agent task is the work one submission sends to the agent. It waits in the queue
    // until a runner picks it up.
    sql: `
      CREATE TABLE review_submissions (
        id TEXT PRIMARY KEY,
        pull_request_id INTEGER NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
        head_sha TEXT NOT NULL,
        verdict TEXT NOT NULL CHECK (verdict IN ('approve', 'request-changes', 'comment')),
        body TEXT NOT NULL,
        comments TEXT NOT NULL,
        draft_ids TEXT NOT NULL,
        finding_ids TEXT NOT NULL,
        send_to_agent INTEGER NOT NULL CHECK (send_to_agent IN (0, 1)),
        state TEXT NOT NULL DEFAULT 'publishing'
          CHECK (state IN ('publishing', 'published', 'failed')),
        provider_review_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        published_at TEXT
      ) STRICT;

      CREATE INDEX review_submissions_pull_request ON review_submissions (pull_request_id);

      CREATE TABLE agent_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id TEXT NOT NULL UNIQUE
          REFERENCES review_submissions (id) ON DELETE CASCADE,
        pull_request_id INTEGER NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'running', 'waiting', 'stopped', 'failed', 'completed')),
        session_id TEXT,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX agent_tasks_pull_request ON agent_tasks (pull_request_id);
    `,
  },
  {
    version: 17,
    name: 'agent_worktrees',
    // The folder where agents work on one pull request, outside the user's checkout. It is
    // keyed by repository and number rather than the pull request row, because that row is
    // deleted once the pull request closes, and the folder must still be cleaned up then.
    // head_sha is the commit PReview last put it on. writer_task_id is the one task allowed
    // to change it, or null when none is.
    sql: `
      CREATE TABLE agent_worktrees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        path TEXT NOT NULL UNIQUE,
        head_branch TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        writer_task_id INTEGER REFERENCES agent_tasks (id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (repository_id, number)
      ) STRICT;
    `,
  },
  {
    version: 18,
    name: 'agent_task_results',
    // result is the agent's closing report as JSON, null until a run completes. error says why
    // the last run failed or couldn't start. cost_usd is Claude Code's own estimate.
    sql: `
      ALTER TABLE agent_tasks ADD COLUMN result TEXT;
      ALTER TABLE agent_tasks ADD COLUMN error TEXT;
      ALTER TABLE agent_tasks ADD COLUMN cost_usd REAL;
      ALTER TABLE agent_tasks ADD COLUMN started_at TEXT;
      ALTER TABLE agent_tasks ADD COLUMN finished_at TEXT;
    `,
  },
  {
    version: 19,
    name: 'agent_activity',
    // The activity feed of each task: short summaries, with the technical detail behind them.
    // A question is what the agent asked the user, as JSON, and the answers once given.
    // resume_note is the message the next resumed run starts with, such as an answer given
    // after the app restarted.
    sql: `
      CREATE TABLE agent_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES agent_tasks (id) ON DELETE CASCADE,
        kind TEXT NOT NULL
          CHECK (kind IN ('status', 'message', 'tool', 'file', 'test', 'error', 'question', 'answer')),
        summary TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX agent_events_task ON agent_events (task_id);

      CREATE TABLE agent_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES agent_tasks (id) ON DELETE CASCADE,
        questions TEXT NOT NULL,
        answers TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'answered', 'cancelled')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        answered_at TEXT
      ) STRICT;

      CREATE INDEX agent_questions_task ON agent_questions (task_id);

      ALTER TABLE agent_tasks ADD COLUMN resume_note TEXT;
    `,
  },
  {
    version: 20,
    name: 'agent_task_push',
    // What happened to a completed run's changes. waiting: they need the user's go-ahead,
    // because a test failed or none were reported. blocked: the push failed, and push_error
    // says why. pushed_sha is the commit PReview pushed. ci_status follows that commit's checks,
    // and ci_checks holds them as JSON.
    sql: `
      ALTER TABLE agent_tasks ADD COLUMN push_status TEXT
        CHECK (push_status IN ('waiting', 'pushed', 'blocked', 'no_changes'));
      ALTER TABLE agent_tasks ADD COLUMN push_error TEXT;
      ALTER TABLE agent_tasks ADD COLUMN pushed_sha TEXT;
      ALTER TABLE agent_tasks ADD COLUMN pushed_at TEXT;
      ALTER TABLE agent_tasks ADD COLUMN ci_status TEXT
        CHECK (ci_status IN ('pending', 'passed', 'failed'));
      ALTER TABLE agent_tasks ADD COLUMN ci_checks TEXT;
    `,
  },
  {
    version: 21,
    name: 'merged_pull_requests',
    // A summary of the review, saved when the reviewer merges the pull request. It has no
    // foreign key, because the pull request row is deleted once it closes.
    sql: `
      CREATE TABLE merged_pull_requests (
        pull_request_id INTEGER PRIMARY KEY,
        repository TEXT NOT NULL,
        number INTEGER NOT NULL,
        url TEXT NOT NULL,
        merged_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        comments INTEGER NOT NULL,
        suggestions INTEGER NOT NULL,
        bugs_caught INTEGER NOT NULL,
        files_reviewed INTEGER NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 22,
    name: 'github_repository_accounts',
    // The GitHub account each repository's requests go out with. Keyed by owner/name, so two
    // clones of one repository share it. manual is 1 when the user picked the account, 0 when
    // PReview assigned it.
    sql: `
      CREATE TABLE github_repository_accounts (
        full_name TEXT PRIMARY KEY COLLATE NOCASE,
        login TEXT NOT NULL COLLATE NOCASE,
        manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1))
      ) STRICT;

      CREATE INDEX github_repository_accounts_login ON github_repository_accounts (login);
    `,
  },
  {
    version: 23,
    name: 'xp_progression',
    // Every XP award. reward_key names what earned it, so a retried award adds nothing. The
    // pull request is named by repository and number with no foreign key, because XP stays
    // after the pull request closes. reason is checked in code, so new reasons need no rebuild.
    // review_progress is the character a review earns XP for, picked when the review opens,
    // and its active review time so far. account_progress has one row, the chosen character.
    sql: `
      CREATE TABLE xp_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reward_key TEXT NOT NULL UNIQUE,
        reason TEXT NOT NULL,
        base_xp INTEGER NOT NULL CHECK (base_xp > 0),
        multiplier REAL NOT NULL CHECK (multiplier >= 1 AND multiplier <= 1.5),
        amount INTEGER NOT NULL CHECK (amount > 0),
        active_ms INTEGER NOT NULL CHECK (active_ms >= 0),
        pull_request_id INTEGER NOT NULL,
        repository TEXT NOT NULL,
        number INTEGER NOT NULL,
        finding_id INTEGER,
        character_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX xp_transactions_character ON xp_transactions (character_id);

      CREATE TABLE review_progress (
        pull_request_id INTEGER PRIMARY KEY REFERENCES pull_requests (id) ON DELETE CASCADE,
        character_id TEXT NOT NULL,
        active_ms INTEGER NOT NULL DEFAULT 0 CHECK (active_ms >= 0)
      ) STRICT;

      CREATE TABLE account_progress (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_character TEXT NOT NULL
      ) STRICT;

      INSERT INTO account_progress (id, active_character) VALUES (1, 'shadow');
    `,
  },
  {
    version: 24,
    name: 'review_comment_categories',
    // A draft's category is the kind of problem it points out, null when none was given.
    // review_comments keeps each sent comment, since its draft is deleted once GitHub has it.
    // position is its number in the submission, as the agent knows it (C1, C2, …). Like
    // findings, a comment earns XP once the agent fixed it and the reviewer resolved its thread.
    sql: `
      ALTER TABLE review_drafts ADD COLUMN category TEXT
        CHECK (category IS NULL OR category IN ('bug', 'ui-bug', 'security', 'improvement', 'test'));

      CREATE TABLE review_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pull_request_id INTEGER NOT NULL REFERENCES pull_requests (id) ON DELETE CASCADE,
        submission_id TEXT NOT NULL REFERENCES review_submissions (id) ON DELETE CASCADE,
        position INTEGER NOT NULL CHECK (position >= 1),
        path TEXT NOT NULL,
        line INTEGER NOT NULL,
        body TEXT NOT NULL,
        category TEXT
          CHECK (category IS NULL OR category IN ('bug', 'ui-bug', 'security', 'improvement', 'test')),
        validation TEXT NOT NULL DEFAULT 'pending'
          CHECK (validation IN ('pending', 'validated', 'rejected')),
        resolution TEXT NOT NULL DEFAULT 'open' CHECK (resolution IN ('open', 'resolved')),
        UNIQUE (submission_id, position)
      ) STRICT;

      CREATE INDEX review_comments_pull_request ON review_comments (pull_request_id);

      ALTER TABLE xp_transactions ADD COLUMN comment_id INTEGER;
    `,
  },
];
