# Multiple GitHub Accounts Plan

How PReview connects more than one GitHub account at the same time and uses the right one for each repository. Amends SCOPE.md 6.2 (one account for MVP) and removes "Multiple GitHub accounts" from the 21 exclusions. Everything else in 6.2 still holds: OS-backed credential storage, no tokens in logs, no credentials in SQLite.

## Problem

A developer has a personal account (signs in with PReview's OAuth device flow) and a work account (must sign in through the GitHub CLI). PReview holds exactly one connection: one credential file, one `GitHubAuth`, one `GitHubClient`, one `GitHubProvider` handed to every service. Switching means disconnecting and reconnecting, and the CLI connection follows whatever `gh auth switch` last chose in the terminal.

## Goals

- Connect any number of accounts, each with its own source (`oauth` or `cli`).
- Every GitHub request for a repository goes out with the account that owns that repository.
- A terminal `gh auth switch` never changes which account PReview uses.
- Agent pushes go out as the account that owns the repository.
- One account's rate limit or rejected token does not stop the other account's syncing.
- Existing single-account installs upgrade with no reconnect.

## Non-goals

- Accounts on GitHub Enterprise hosts. `github.com` only, as today.
- Per-pull-request account choice. The account is per repository.
- Revoking OAuth grants on GitHub. Disconnect forgets the local credentials, as today.
- Letting the agent call GitHub. The sandbox has no GitHub network access and the environment allowlist passes no tokens. Unchanged.
- Choosing the account for agent pushes over SSH remotes. An SSH push uses whatever key SSH picks. D11 covers HTTPS remotes only.

## Decisions

- **D1. Accounts, not a connection.** A new `GitHubAccounts` service (`src/main/services/github/accounts.ts`) owns a map of accounts keyed by lowercase login. Each account is a `GitHubAccount`: one credential store, `getToken()`, `verify()`, and its own `GitHubProvider`. Credential files live at `github-credentials/<login>` under `userData`, named by the lowercase login. A directory listing on startup restores every account.
- **D2. The flow belongs to `GitHubAccounts`, not to an account.** The login is unknown until a device flow finishes, so the flow cannot live on a per-login object. `GitHubAccounts` holds the one pending flow and the last error. Starting a second flow cancels the first. When a flow or a CLI connect succeeds, `GitHubAccounts` creates or replaces the `GitHubAccount` for that login. Today's `GitHubAuth` splits along this line: flow, pending state and errors move to `GitHubAccounts`. Stored credentials, `getToken()` and `verify()` stay on `GitHubAccount`.
- **D3. The CLI token is pinned to a login.** `readGhToken` becomes `readGhToken(login?)` and adds `--user <login>` when a login is given. `connectWithCli()` first reads with no login to learn the active account, then stores `{ source: 'cli', user }`. `getToken()` and `verify()` read with `stored.user.login` from then on. A login that gh no longer knows reads as "The GitHub CLI is not signed in as <login>. Run gh auth login and try again." See R5 for the gh version.
- **D4. Routing by repository.** A `RoutingProvider` (`src/main/providers/routing.ts`) implements `GitProvider`. Every method looks up the account for `repositoryFullName` in `github_repository_accounts`, forwards to that account's `GitHubProvider`, and throws `GitHubNotConnectedError` when no account is assigned or the assigned account is gone. Services keep their code, since they already pass the full name.
- **D5. Thread actions carry the pull request.** `replyToThread` and `setThreadResolved` get only a thread id today, from the IPC input down to the provider. `replyToThreadInputSchema` and `setThreadResolvedInputSchema` gain `pullRequestId`. `useThreadActions(pullRequestId)` already has it. `PullRequestReviews` resolves the repository with `this.find(pullRequestId)` and passes it as a new leading `repositoryFullName` parameter to both `GitProvider` methods.
- **D6. Remove `getRepositories()`.** It has no caller. It is removed from `GitProvider`, and `GitHubProvider` keeps only what assignment needs (D7).
- **D7. Automatic assignment.** When a repository has a GitHub remote and no row in `github_repository_accounts`, `PullRequestSync` assigns it before syncing. Each connected account calls `GitHubProvider.getRepository(fullName)`, which reads `GET /repos/{owner}/{name}` and returns `{ canPush }`. Accounts are tried in login order, sorted case-insensitively. The first account with push access wins. With no push access anywhere, the first account that can read the repository wins. With none, the repository shows the sync error "No connected account can access this repository." and is retried on the next sync. Assignment also runs when an account connects, for repositories still unassigned. Automatic rows are written with `manual = 0`.
- **D8. Manual override.** Repository settings gain `account: string | null`. The Integrations screen shows an Account picker on each repository, listing connected accounts plus Automatic. Picking an account writes the row with `manual = 1`. Picking Automatic deletes the row, so D7 assigns it on the next sync. Either change triggers a sync of that repository. Stored pull requests are not cleared. Deleting a `pull_requests` row cascades to drafts, review sessions and agent tasks. `replacePullRequests` already removes the pull requests the new account cannot see and keeps the rest with their drafts.
- **D9. Disconnect.** `disconnect(login)` forgets that account's credentials and deletes its rows in `github_repository_accounts`, manual ones included. D7 then reassigns those repositories to a remaining account or reports the error. Open review sessions keep their drafts, as a disconnect does today.
- **D10. Sync state per account.** `PullRequestSync` keeps `blockedUntil` and `failures` in maps keyed by login. One timer still runs. Each run skips repositories whose account is blocked or backing off, and syncs the rest. `GitHubRateLimitError` and `GitHubUnauthorizedError` carry the login, set by `RoutingProvider` when it forwards the call. `GitHubNotConnectedError` becomes an error on that repository, not the `break` in `sync.ts` today. Otherwise one unassigned repository would stop every repository after it.
- **D11. Agent pushes.** `AgentPublisher` pushes through the system git and its credential helper, not PReview's tokens. `AgentWorktrees.publish` adds `-c credential.https://github.com.username=<login>` to the push command only, the same way `safeGit` adds its `-c` flags. No git config is written, so the user's own checkout is untouched. A missing credential fails the push with git's own message, as today. PReview's tokens never reach git. See R6.
- **D12. Renderer state.** `GitHubAuthState` becomes:
  ```ts
  {
    accounts: { login, name, avatarUrl, source }[];
    pending?: { userCode, verificationUri, expiresAt };
    error?: string;
  }
  ```
  The contract never includes a token, as today. `useGitHubAuth` polls once a second while `pending` is set. The repository contract gains `account: string | null`, the assigned login.
- **D13. IPC.** `github.connect()` and `github.connectWithCli()` add an account. `github.disconnect(login)` and `github.cancel()` replace the no-argument forms. `repositories.updateSettings` accepts `account`.
- **D14. Migration.** The old credential path is a file and the new one is a directory with the same name, so the move goes in this order on startup, before any account loads:
  1. If `github-credentials` is a file, rename it to `github-credentials.legacy`.
  2. If `github-credentials.legacy` exists, read it, create `github-credentials/`, write `github-credentials/<login>`, then delete the legacy file.

  Each step can run again after a crash at any point, and the legacy file is deleted only after the new one is written. The schema migration only creates the `github_repository_accounts` table, since migrations are SQL. Nothing is backfilled. With one account, D7 assigns every repository on the first sync, costing one request per repository once. An install with no old file starts with no accounts.
- **D15. Logs.** Log lines name the login, never the token. The existing redaction in `src/main/logging/redact.ts` is unchanged.
- **D16. Renderer uses of the login.** Three places read the single connected user today. With more than one account they read the pull request's repository account instead:
  - The self-approve check (`review.$pullRequestId.tsx`, author login compared with the user's).
  - The author shown on draft comments (same file).
  - The Dashboard greeting (`dashboard.tsx`) shows the first account's name.

  `GitHubPrompt` and the Inbox check `accounts.length === 0` instead of `status === 'disconnected'`.

## Data

```sql
CREATE TABLE github_repository_accounts (
  full_name TEXT PRIMARY KEY COLLATE NOCASE,
  login TEXT NOT NULL COLLATE NOCASE,
  manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1))
) STRICT;

CREATE INDEX github_repository_accounts_login ON github_repository_accounts (login);
```

Keyed by `owner/name`, not by repository row. Two clones of the same repository are two rows in `repositories` but one GitHub repository. `RoutingProvider` only receives the full name. `login` is the login as GitHub spells it, compared case-insensitively.

Credential files under `userData/github-credentials/`:

```
<login>   encrypted JSON, same schema as today: { source, user, token? }
```

## Screens

**Integrations, GitHub section.** A list of connected accounts: avatar, login, name, "through the GitHub CLI" when `source` is `cli`, and a Disconnect button each. Below it, Add account, which opens the connect dialog. With no accounts the section shows the current Connect GitHub call to action.

**Connect dialog.** Unchanged flow with two entry points, Connect with GitHub and Use the GitHub CLI. After success it shows the new account and a Done button. Adding an account already connected replaces its stored credentials and shows "Already connected as @login".

**Integrations, Repositories.** Each repository row gains an Account column showing the assigned login, or "Not assigned" with the D7 error when assignment failed. The row's settings sheet gains the Account picker from D8.

**Dashboard and Inbox.** Pull requests show no account badge. The repository decides the account, and the repository is already shown.

## Slices

Each slice is its own branch and PR. Each ships with its unit tests next to the changed modules, as the current code does.

### 1. Pin the CLI token

- `readGhToken(login?)` with `--user`, and the two-step connect in D3.
- `GitHubAuth.getToken()` and `verify()` pass `stored.user.login`.

Done when a `gh auth switch` in the terminal leaves a CLI-connected PReview on its original account. The D3 message reaches the log on the next sync. It reaches the screen in slice 2, once D10 turns a missing token into an error on each repository instead of a silent stop.

### 2. Accounts and routing, behind the current UI

- The D2 split into `GitHubAccounts` and `GitHubAccount`, credential files per login, the D14 file move.
- The `github_repository_accounts` table, `RoutingProvider`, D5 and D6.
- Assignment (D7) and the D10 per-account sync state, including the not-connected change.
- The IPC and contract keep their single-account shape by exposing the first account, so the renderer is unchanged. D5's `pullRequestId` is the one renderer change.

Done when an upgraded install syncs exactly as before, every repository gets assigned to the migrated login on the first sync, and the tests cover: routing to the right provider, the unassigned error, an unassigned repository not stopping the others, rate limiting one account while another syncs, the file move resuming after a crash at each step, and two clones of one repository sharing one assignment.

### 3. Multiple accounts in the UI

- D12 contract, D13 IPC, the Integrations account list, Add account, Disconnect per account (D9), the repository Account column and picker (D8), and D16.

Done when a personal OAuth account and a work CLI account are connected at once, a repository from each syncs and reviews submit under the right login, the self-approve check uses the repository's account, and overriding a repository's account resyncs it without losing drafts on pull requests both accounts can see.

### 4. Agent pushes

- Check R6 first.
- D11 per-push credential username.

Done when an agent task on a work repository with an HTTPS remote pushes as the work account while the personal account is also connected, verified by the commit's pusher on GitHub.

## Risks

- **R1. Public repositories both accounts can read.** D7 prefers push access, then login order. The override in D8 covers the rest. The order is fixed, so a reconnect gives the same result.
- **R2. The credential helper has no entry for a login.** D11 then fails the push with git's message. The fix is a one-time `git push` from a terminal as that account, which PReview tells the user in the push error.
- **R3. Two accounts, one OAuth app.** Both OAuth connections use PReview's one client ID. GitHub allows that. Each account gets its own token and its own 5000 requests an hour.
- **R4. A crash during the credential move.** D14 orders the steps so each can run again and the old credentials are deleted last. The schema migration runs in its own transaction as today and touches no files.
- **R5. gh version.** D3 assumes `gh auth token --user` exists, believed to have arrived with multi-account support in gh 2.40. Not yet verified. Confirm before slice 1, and decide whether older gh fails with a "Update the GitHub CLI" message.
- **R6. Credential helpers and `credential.username`.** Git Credential Manager picks the stored account by `credential.username`. Not yet verified for `gh auth git-credential` as the helper. Confirm before slice 4. If it ignores the username, D11 needs another approach for those users.
