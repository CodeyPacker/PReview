# Agent Connection Plan

How PReview runs Claude Code on submitted review feedback. Implements SCOPE.md sections 6.6, 6.8, 7.3, 7.4 and 10.

Parts are adapted from the Pensieve repo (`~/projects/pensieve`, commit `31ce6a7`). File references below point there.

## Decisions

- **D1. Process.** The Claude Agent SDK runs in the Electron main process. `query()` already starts Claude Code as its own child process. The SDK is loaded with `import()` on first use. `pathToClaudeCodeExecutable` points at the binary from `@anthropic-ai/claude-agent-sdk-<platform>-<arch>`, which electron-builder ships outside the asar archive (`asarUnpack`). Source: `claudeExecutable()` in `src/agents/claude.ts`, `scripts/package-desktop.mjs`.
- **D2. Sign-in.** Reuse the user's existing Claude Code login. PReview stores no Anthropic key. Claude gets only an allowlist of environment variables. `query.accountInfo()` runs before a task starts, so PReview can say "not signed in" instead of failing mid-run. Source: `claudeEnvironment()` and `connect()` in `src/agents/claude.ts`.
- **D3. Boundary.** Two layers, both enforced in code:
  - The OS sandbox (`Options.sandbox`) confines shell commands: writes only in the worktree and a private temp folder, no writes to `.git`, no network, `failIfUnavailable: true`, `allowUnsandboxedCommands: false`. Bash runs without prompts because of this. macOS uses Seatbelt. Windows uses the SDK's native sandbox, which runs commands as a separate low-rights user. Source: `src/agents/claude-isolation.ts`, `src/agents/macos-toolchain.ts`.
  - A `canUseTool` gate: a fixed list of built-in tools (`Read`, `Glob`, `Grep`, `Edit`, `Write`, `MultiEdit`, `Bash`, `TodoWrite`), with web, subagent and slash-command tools blocked. File paths outside the worktree are denied, and so is `dangerouslyDisableSandbox`. Source: `canUse` in `src/agents/claude.ts`. The coordinator approval branch is dropped, since every PReview agent works alone in its own worktree.
- **D4. Repository instructions.** `settingSources: []`. PReview reads `CLAUDE.md` itself and appends it to the system prompt. Loading project settings would also run `.claude/settings.json` hooks from the PR branch.
- **D5. Commits and pushes.** PReview commits and pushes, not the agent. This keeps no-force-push and the divergence check (7.4) in PReview's own code.
- **D6. Questions.** The agent asks through the built-in `AskUserQuestion` tool. `canUseTool` catches the call, saves a pending question and waits for the answer from the Inbox. If the app restarted in between, the answer resumes the saved session as a new message. Streaming input (`InputQueue`) is used so answers can be sent in. Source: `ask()`, `answer()` and `InputQueue` in `src/agents/claude.ts`.
- **D7. Storage.** Typed tables, `agent_tasks` and `agent_events`, added through `src/main/database/migrations.ts`. Pensieve's single JSON blob per session is not used.
- **D8. Renderer updates.** The main process sends a throttled `agents:changed` signal (250 ms) and the renderer invalidates its TanStack Query cache. Source: `src/desktop/main.ts`.
- **D9. No duplicates after a crash.**
  - Review publish: the review body carries a hidden `<!-- preview-submission:<id> -->` marker. A retry in an uncertain state checks the PR's reviews for the marker before posting again. This fixes the current gap in `src/main/services/pull-requests/reviews.ts`, where a crash after GitHub accepts the review but before drafts are deleted leads to a double post.
  - Agent launch: the session id is generated and saved before `query()` runs. A restart resumes that session instead of starting a second agent.
- **D10. Not taken from Pensieve.** The coordinator, feature plans, steering, multi-turn chat, context refresh, provider switching, the Codex provider and its JSON-RPC transport, the provider registry, the loopback HTTP MCP host and launcher (section 11, later), and the isolation probe (`failIfUnavailable` covers the basic case).

## Platform seam

Everything platform-specific lives in one isolation module with one function per platform:

- readable tool paths (macOS: Homebrew and `/usr` paths, Windows: Git for Windows, Node, `Program Files`)
- the private temp folder
- shell availability (Windows needs Git Bash or PowerShell, otherwise `shell_tool_missing`)
- sandbox setup check (Windows: one-time `/sandbox install`, likely needing admin)

Path checks everywhere else use `path.relative`, so drive letters, backslashes and case work on Windows.

## Slices

Each slice is its own branch and PR.

### 0. Spike on macOS and Windows

Prove the SDK, sign-in and sandbox work in packaged builds on both platforms.

- Add an electron-builder config (none exists yet) for macOS and Windows, with `asarUnpack` for `@anthropic-ai/claude-agent-sdk-*`.
- Add the parts that survive the spike: executable lookup, environment allowlist, sign-in check, the isolation module (both platforms) and the `canUseTool` gate.
- Add a temporary development trigger that runs one task in a throwaway Git worktree.

Done when, in a packaged build on macOS and on Windows, without any prompt:

- editing a file in the worktree and running a test command succeed
- reading a file outside the worktree, writing to `.git` and making a network request fail
- a missing sign-in or missing sandbox setup shows a clear message

The trigger is removed before the PR merges.

### 1. Durable submissions and the send flow

- `agent_tasks` table: submission id, pull request, status, Claude session id, attempts, timestamps.
- Send to Agent: validate drafts, check the PR revision, publish with the marker (D9), confirm, create the task, save the link. Tasks stay queued, no runner yet.
- Restart recovery for a submission stuck between publish and save.

### 2. Worktrees

- One worktree per active PR, outside the user's checkout, reused across review rounds.
- Never overwrite uncommitted changes. Detect unexpected branch changes. One writer per worktree.
- Create worktrees without running repository hooks or checkout filters. Source: `trustedGit()` in `src/agents/workspaces.ts`.
- Clean up after merge only when nothing is unpreserved.

### 3. Runner and queue

- `AgentProvider` interface (SCOPE 10.2) with the Claude adapter from slice 0.
- Task context (10.3) built into the first prompt, plus `CLAUDE.md` (D4).
- Two concurrent tasks by default, FIFO with manual reordering, two automatic retries, then stop with the worktree kept.
- Graceful stop with Force Stop, and resume by session id.
- `rate_limit_event` handling: stop with the reset time, no automatic switch. Source: `receive()` in `src/agents/claude.ts`.
- 25-minute runtime notification.

### 4. Activity feed and questions

- `agent_events` table and mapping from SDK messages to event kinds (status, tool, file, test, message, error, question). Source: `toolActivity()` and `receive()` in `src/agents/claude.ts`.
- Error text passes through `src/main/logging/redact.ts`.
- Live feed through `agents:changed` (D8).
- Questions in the Action Required Inbox, with text and choice answers (D6).

### 5. Push and CI follow-up

- PReview commits the agent's changes and pushes fast-forward only after a divergence check. It stops and asks when that isn't possible.
- Watch required checks and mark the PR Ready for Re-review when they pass.
- On CI failure, show Investigate with Claude. Never relaunch automatically.

## Risks

- **R1. Windows sandbox is unverified.** It is described in the SDK types (`sdk.d.ts`, 0.3.314), not tested. Slice 0 settles it.
- **R2. Network off blocks dependency installs.** Start with no network. Add per-repository allowed domains (package registries) when a repository needs it (10.11).
- **R3. Sign-in terms.** Reusing the Claude Code login fits a personal local app. Check Anthropic's Agent SDK terms before distributing PReview to others.
