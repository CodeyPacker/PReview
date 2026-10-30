# PReview — Product Scope & Technical Specification

**Version:** 1.0  
**Status:** MVP specification  
**Platforms:** Windows and macOS  
**Application Type:** Local-first desktop application

---

# 1. Project Overview

## 1.1 Purpose

PReview is a gamified pull request review application designed to make reviewing AI-generated code more engaging, efficient, and rewarding.

As AI coding agents increasingly handle implementation, developers spend more time reviewing, identifying bugs, requesting changes, and validating solutions.

PReview transforms that work into a rewarding experience through character progression, experience points, achievements, animated companions, and personalized environments.

Its primary purpose remains delivering an excellent code review experience.

**The game should make reviewing code more enjoyable without compromising code quality or reviewer productivity.**

## 1.2 Primary Objectives

1. Deliver a polished, VS Code-quality code diff viewing experience.
2. Centralize pull requests requiring review across locally tracked repositories.
3. Support inline feedback, review discussions, and standalone bug reports.
4. Allow reviewers to submit feedback directly to an AI coding agent.
5. Automate agent execution, fixes, testing, and re-review preparation.
6. Reward meaningful code review contributions through XP and progression.
7. Provide customizable animated characters and cosmetic rewards.
8. Maintain a local-first desktop architecture without a hosted backend.
9. Keep the application independent of the user's preferred editor or AI development environment.

## 1.3 Design Principles

- **Review-first:** Code review functionality takes priority over gamification.
- **Minimal friction:** Avoid unnecessary clicks, configuration, and interruptions.
- **Local-first:** Primary application state lives on the user's computer.
- **Agent-independent architecture:** Avoid tightly coupling application logic to a particular AI provider.
- **Human verification:** AI agents cannot approve their own fixes or award XP.
- **Context preservation:** Never lose draft comments, review progress, or unfinished agent work.
- **Visual consistency:** All screens follow the approved reference designs.
- **Focused scope:** Do not turn PReview into a full IDE, Git client, or general-purpose agent orchestration platform.

---

# 2. Approved Technology Stack

| Layer | Technology |
|---|---|
| Desktop framework | Electron |
| UI framework | React |
| Language | TypeScript |
| Build tooling | Vite |
| Styling | CSS Modules |
| Component primitives | Base UI |
| Database | SQLite |
| Data fetching and caching | TanStack Query |
| Routing | TanStack Router |
| Large list virtualization | TanStack Virtual |
| Forms | TanStack Form |
| Keyboard shortcuts | TanStack Hotkeys |
| Code and diff viewer | Monaco Editor |
| Git provider | GitHub |
| AI execution | Claude Agent SDK |
| Agent interoperability | MCP |
| Repository operations | Git CLI |
| Local text search | ripgrep or equivalent |

## 2.1 Technology Constraints

- Use TypeScript across Electron, React, services, and shared packages.
- Use CSS Modules for application styling.
- Use Base UI for accessible, unstyled interactive primitives.
- Use TanStack Query for asynchronous queries, mutations, and cache invalidation.
- Use TanStack Router for application navigation.
- Use SQLite for persistent application data.
- Do not add unnecessary state-management libraries.
- Do not introduce a hosted backend for the MVP.
- Keep the architecture modular and testable.

## 2.2 Deferred Technologies

- TanStack DB
- TanStack Table, unless advanced grids justify it
- Vim emulation
- Language Server Protocol integration
- Cloud synchronization

## 2.3 Development Dependencies

Choose supporting libraries according to actual implementation needs.

Likely requirements include:

- GitHub API client
- SQLite driver and migration tooling
- Schema validation
- Logging
- Testing utilities
- Electron packaging and update tooling
- Sprite animation renderer

Document architectural dependencies before introducing them.

---

# 3. System Architecture

## 3.1 Architecture Overview

```text
┌──────────────────────────────────┐
│       React Renderer             │
│                                  │
│  Dashboard / Inbox / Reviews     │
│  Characters / Achievements       │
│  Integrations / Settings         │
│                                  │
│  TanStack Query / Router         │
│  Monaco / Base UI                │
└────────────────┬─────────────────┘
                 │
         Typed Electron IPC
                 │
┌────────────────▼─────────────────┐
│       Electron Backend           │
│                                  │
│  Application Services            │
│  Review Workflow Service         │
│  GitHub Provider Adapter         │
│  Agent Execution Manager         │
│  Repository Discovery            │
│  XP / Achievement Engine         │
│  Notification Service            │
│  Event Dispatcher                │
└───────────┬───────────┬──────────┘
            │           │
        SQLite       External Systems
                     GitHub / Claude
                     Git CLI / MCP
```

## 3.2 Architectural Layers

### Renderer

Responsible for:

- Rendering application screens
- User interaction
- Displaying code diffs
- Local presentation state
- Query caching
- Route navigation
- Character animation playback

The renderer must not directly access SQLite, operating-system credentials, Git commands, or unrestricted filesystem operations.

### Preload

Expose a minimal, typed, explicitly authorized IPC interface.

Do not expose the complete Electron IPC or Node.js APIs to the renderer.

### Application Services

Implement business logic independently of UI components.

Services should be reusable by both Electron IPC and the MCP integration.

### Database

SQLite is the local persistent source of truth for PReview-specific data.

GitHub remains authoritative for published PR state, comments, reviews, commits, CI results, and merge status.

### External Integrations

Provider-specific operations must remain behind interfaces so future Git and AI providers can be added without restructuring core application logic.

---

# 4. Repository Structure

Recommended initial structure:

```text
preview/
├── SCOPE.md
├── designs/
│   ├── dashboard.png
│   ├── inbox.png
│   ├── pr-review.png
│   ├── zen-mode.png
│   ├── characters.png
│   ├── achievements.png
│   ├── integrations.png
│   ├── settings.png
│   └── post-merge.png
├── assets/
│   └── characters/
├── src/
│   ├── main/
│   │   ├── ipc/
│   │   ├── services/
│   │   ├── providers/
│   │   ├── agents/
│   │   ├── database/
│   │   ├── git/
│   │   └── security/
│   ├── preload/
│   ├── renderer/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── styles/
│   │   └── routes/
│   └── shared/
│       ├── contracts/
│       ├── types/
│       └── schemas/
├── tests/
├── scripts/
└── package.json
```

Organize code by domain and responsibility.

Do not create excessive abstractions or files without a real implementation need.

The `designs/` filenames are the expected reference names; use the actual names of the saved approved images if they differ.

---

# 5. User Experience & Screens

The following screens have approved visual references.

Visual implementation should closely follow the approved artwork while adapting layouts where necessary for responsive window sizes, accessibility, and functional behavior.

## 5.1 Dashboard

**Reference:** `designs/dashboard.png`

### Purpose

Provide a quick overview of review workload, user progression, and recent activity.

### Features

- Personalized greeting
- Global account level and XP progress
- Active animated character
- Pending PR overview
- Recent PR activity
- Bugs caught
- Suggestions and improvements
- Reviews completed
- Review streaks
- Recent achievements
- Quick navigation into the Inbox and individual reviews
- Relevant agent activity summaries

### Behavior

- Dashboard statistics update when underlying review data changes.
- Clicking a PR opens its review workspace.
- Character XP and global account XP remain separate.
- Avoid duplicating the full Inbox or detailed statistics pages.

## 5.2 Inbox

**Reference:** `designs/inbox.png`

### Purpose

Centralize review work requiring attention.

### Layout

- Main application sidebar
- Searchable and filterable PR queue
- Selected PR summary panel
- Prominent Open Review action

### Review Statuses

- Needs Review
- In Progress
- Ready for Re-review
- Action Required
- Completed

### Features

- Unread filter
- Repository filtering
- PR search
- Agent/author metadata
- Draft comment counts
- Review priority
- CI status
- Latest agent status
- Pending clarification requests
- Agent permission requests
- Queue ordering and manual agent task prioritization

### Behavior

Track all eligible PRs from monitored repositories, but prioritize:

1. PRs assigned to the user for review
2. User-authored PRs
3. PRs flagged by agents for attention
4. Other tracked PRs

Only notify the user when attention is required.

The Inbox is for triage and navigation, not full code review.

## 5.3 PR Review Screen

**Reference:** `designs/pr-review.png`

### Purpose

Provide the primary code review experience.

### Layout

- PR metadata and review toolbar
- Changed-file tree
- Monaco diff viewer
- Inline comments and discussions
- Agent activity panel
- Findings and validation states
- Compact XP information

### Review Actions

- Approve
- Request Changes
- Comment
- Send to Agent
- Finish Review
- Merge PR, when permitted
- Enter Zen Mode

### Requirements

- Side-by-side and unified diff modes
- Syntax highlighting
- Expandable unchanged context
- Code folding
- Inline comments
- Standalone findings
- Manual file-reviewed checkboxes
- GitHub discussion synchronization
- Changes-since-last-review mode
- Read-only individual commit viewing
- Repository-wide text search
- Search within current file
- Keyboard navigation
- AI suggestion markers
- Agent progress visibility

All review actions must remain accessible without cramped toolbars or overflowing controls.

## 5.4 Zen Mode

**Reference:** `designs/zen-mode.png`

### Purpose

Provide a distraction-free code review workspace.

### Visible Elements

- Minimal PR toolbar
- Searchable file tree
- Expanded Monaco diff viewer
- Split/unified controls
- Diff navigation
- Exit Zen Mode control

### Hidden Elements

- Main application navigation
- Mascot
- XP statistics
- Achievements
- Agent activity sidebar
- Nonessential findings panels

### Behavior

- Preserve the active file.
- Preserve scroll position.
- Preserve selected diff.
- Preserve draft comments.
- Continue allowing inline comments.
- Support configurable keyboard shortcuts.
- Escape exits Zen Mode.
- Avoid animations and unrelated notifications inside Zen Mode.

## 5.5 Characters

**Reference:** `designs/characters.png`

### Purpose

Allow the user to view, select, level, and customize cosmetic companions.

### Features

- Character collection
- Available and locked characters
- Animated sprite preview
- Animation selection
- Individual character levels
- Character XP progress
- Outfit selection
- Level-based unlock timeline
- Global account progression
- Favorite character selection

### Important Constraint

Characters are purely cosmetic.

They are not AI agents, workers, assistants, or task executors.

## 5.6 Achievements

**Reference:** `designs/achievements.png`

### Purpose

Display long-term accomplishments and detailed review statistics.

### Features

- Account progression
- Earned achievements
- Locked achievements
- In-progress achievements
- Badge collection
- Review statistics
- Activity history
- XP breakdown
- Recent milestones

### Excluded Elements

- Achievement category panels
- Featured badge panels
- Complex challenge systems

## 5.7 Integrations

**Reference:** `designs/integrations.png`

### Purpose

Configure repositories and external services.

### Navigation

One main sidebar item named **Integrations**.

### Internal Sections

- Repositories
- GitHub
- Local Folders
- MCP Server
- AI Agents

Architect for future GitLab and Azure DevOps support, but do not enable unsupported providers in the MVP.

### Repository Configuration

- Tracked repositories
- Repository availability
- Watched root folders
- Monitoring controls
- Agent permissions
- Required test commands
- Auto-push permissions
- Repository-specific review settings

## 5.8 Settings

**Reference:** `designs/settings.png`

### Categories

- General
- Appearance
- Review Preferences
- Notifications
- Privacy & Data
- Advanced

### General

- Startup screen
- Launch behavior
- Update preferences
- System tray behavior

### Appearance

- Theme selection
- Accent colors
- UI density
- Font size
- Editor preferences

### Notifications

Support notifications for:

- New PRs requiring attention
- Agent mentions or clarification requests
- Agent completion and re-review readiness
- Agent failure or permission requests
- Long-running agents
- Achievements and milestones

Avoid notifications for the user's own routine actions, weekly summaries, or unnecessary review-completion events.

### Advanced

- Configurable agent concurrency
- Default Claude model
- Keybinding customization
- Logs and troubleshooting
- Backup export and restore

Do not implement Vim emulation in the MVP.

## 5.9 Post-Merge Results

**Reference:** `designs/post-merge.png`

### Purpose

Celebrate successful PR merges and summarize the user's accomplishments.

### Features

- Animated companion celebration
- Minimal merged PR details
- Bugs caught
- Suggestions
- Comments
- Files reviewed
- XP earned during the PR lifecycle
- Account progression
- Assigned character progression
- Achievements unlocked
- Cosmetic rewards
- Next PR navigation
- GitHub link
- Return to Dashboard

### Behavior

The full results experience appears after a successful merge.

XP should already have been awarded when findings were validated and verified. The post-merge screen summarizes those rewards rather than awarding them a second time.

No detailed validated-findings list or unnecessary hero text.

---

# 6. GitHub Integration

## 6.1 Supported Provider

GitHub only for MVP.

Use a provider interface supporting future GitLab and Azure DevOps adapters.

Illustrative contract:

```ts
interface GitProvider {
  getRepositories(): Promise<Repository[]>;
  getPullRequests(
    repositoryId: string
  ): Promise<PullRequest[]>;

  getPullRequest(
    repositoryId: string,
    pullRequestId: string
  ): Promise<PullRequest>;

  getFiles(
    repositoryId: string,
    pullRequestId: string
  ): Promise<ChangedFile[]>;

  getCommits(
    repositoryId: string,
    pullRequestId: string
  ): Promise<Commit[]>;

  getReviewThreads(
    repositoryId: string,
    pullRequestId: string
  ): Promise<ReviewThread[]>;

  submitReview(
    input: SubmitReviewInput
  ): Promise<SubmittedReview>;

  replyToThread(
    input: ReplyToThreadInput
  ): Promise<void>;

  updateThreadResolution(
    input: UpdateThreadResolutionInput
  ): Promise<void>;

  mergePullRequest(
    input: MergePullRequestInput
  ): Promise<MergeResult>;
}
```

This is a conceptual interface, not a final API contract.

Use stable internal IDs and provider-specific identifiers instead of assuming all providers use GitHub's numbering or thread model.

## 6.2 Authentication

Use GitHub OAuth Device Flow.

Requirements:

- Browser-based authorization
- One GitHub account for MVP
- Credentials stored through secure OS-backed facilities
- Credential refresh or reauthorization handling where applicable
- Disconnect account action
- No tokens in application logs
- No credentials stored in SQLite

Verify the exact GitHub OAuth application configuration and permissions before implementing authentication.

## 6.3 Repository Eligibility

Only support PRs when:

- A matching local Git repository exists.
- The repository is tracked by PReview.
- The PR originates from a branch in the same repository.
- Required GitHub permissions are available.

Fork-origin PRs are excluded from the MVP.

PRs with no local repository are not reviewable in the MVP.

## 6.4 Synchronization

- Default GitHub polling interval: approximately 60 seconds
- Adaptive polling and backoff
- Conditional requests where supported
- Refresh when entering Inbox
- Refresh when opening a PR
- Immediate local events from integrated AI agents
- Preserve active review state during updates

Respect GitHub API limits and rate-limit responses.

## 6.5 GitHub Review Functionality

Support:

- Viewing PR metadata
- Changed files
- Combined diffs
- Commit history
- Review comments
- Replies
- Thread resolution and reopening
- Approval
- Request Changes
- General Comment
- Merge actions
- CI checks and logs
- Merge-blocker explanations

## 6.6 Review Submission

Draft comments remain local until submitted.

On Send to Agent:

1. Validate local drafts.
2. Check current PR revision.
3. Publish feedback to GitHub.
4. Confirm publication succeeded.
5. Create or dispatch the agent execution task.
6. Persist the submission and execution relationship.

Use durable submission identifiers and idempotent workflow operations to prevent duplicate comments and agents after failures or restarts.

GitHub remains authoritative for published discussions.

## 6.7 Merge Handling

- Approval and merging are separate operations.
- Warn about unresolved findings.
- Warn about unreviewed files.
- Allow intentional confirmation.
- Respect repository branch protection.
- Offer supported merge methods.
- Preselect the preferred or previously used merge method.
- Never merge automatically after approval.
- Respect GitHub automatic branch deletion settings.

If merging is blocked, explain the reasons and show relevant actions.

## 6.8 CI Integration

Display required and optional GitHub checks.

After agent fixes are pushed:

1. Monitor required CI checks.
2. Allow the agent process to finish independently.
3. Mark the PR Ready for Re-review when required checks pass.
4. Notify the user.
5. If required CI fails, present an Investigate with Claude action.

Do not automatically launch another agent after remote CI failure.

---

# 7. Repository Discovery & Git Operations

## 7.1 Discovery

Users configure one or more watched root directories.

PReview recursively detects existing and newly created Git repositories.

Requirements:

- Detect nested repositories.
- Ignore Git submodules as independent projects.
- Skip dependency and generated directories.
- Support configurable scan depth.
- Avoid duplicate repository registration.
- Recognize moved repositories when possible.
- Mark missing repositories Unavailable.
- Preserve review history and XP when a repository disappears.
- Reconnect rediscovered repositories.

## 7.2 Repository Identity

Repository identity should not depend exclusively on filesystem path.

Store enough Git metadata to reconnect moved repositories reliably, while avoiding accidental matches between unrelated clones.

## 7.3 Isolated Worktrees

All automated code modifications occur in isolated Git worktrees.

Requirements:

- One dedicated worktree per active PR workflow
- Never modify the user's primary checkout
- Never overwrite user changes
- Reuse worktrees across review cycles
- Preserve unfinished changes
- Detect unexpected branch changes
- Prevent simultaneous agents from writing to the same PR worktree
- Clean up safely after PR merge

Do not delete worktrees with uncommitted or otherwise unpreserved changes.

## 7.4 Automatic Pushes

Agents may automatically push approved fixes to the existing PR branch when enabled and required checks pass.

Restrictions:

- No force-push
- No protected branch modification
- No automated merge
- No unrelated branch modification
- No unauthorized remote operations

Detect remote branch divergence before pushing.

If a safe fast-forward push is not possible, stop and request user intervention rather than rewriting history.

---

# 8. Code Review Engine

## 8.1 Monaco Integration

Monaco is the primary diff-rendering component.

Support:

- Side-by-side diffs
- Unified diffs
- Syntax highlighting
- Folding
- Expandable context
- Inline decorations
- Inline comment widgets
- Read-only code browsing
- Split/unified switching
- Diff navigation

## 8.2 Large PR Performance

- Load changed-file metadata first.
- Fetch file diffs on demand.
- Cache previously loaded diffs.
- Avoid rendering entire large PRs simultaneously.
- Use TanStack Virtual for long file lists.
- Release unnecessary editor models and resources.
- Keep scrolling responsive.

## 8.3 File Status Tracking

Files are manually marked Reviewed.

Display reviewed/total counts.

When a new commit modifies a previously reviewed file, reset it to Unreviewed.

Do not infer review completion from scrolling.

## 8.4 Individual Commits

Support read-only per-commit diff inspection.

All new review comments must be created from the combined PR diff.

Switching between modes should preserve the selected file and review position when feasible.

## 8.5 File Handling

- Standard text files: Monaco diffs
- Renamed files: old/new paths and content comparison
- Deleted files: original content
- Images: side-by-side original and updated previews
- Large files: collapsed by default
- Generated files: collapsed by default
- Binary files: useful metadata/fallback presentation

Advanced move detection is deferred.

## 8.6 Searching and Navigation

- Current-file search
- Repository-wide text search
- Search result navigation
- Read-only browsing outside changed files
- Expandable diff context
- File tree navigation

Do not implement Go to Definition, Find References, LSP, or symbol-aware navigation in the MVP.

## 8.7 Outdated Comments

For code changed after comments are created:

- Reattach comments when the mapping is reliable.
- Preserve comments in their original review round when changes are substantial.
- Flag ambiguous mappings as outdated.
- Never automatically resolve a finding because code disappeared.

## 8.8 Review Sessions

Persist:

- Active PR
- Selected file
- Scroll position
- Diff mode
- Review-round baseline
- Draft comments
- File-reviewed markers
- Review state
- Character assigned to the PR

Restore sessions after navigation or application restart.

When new commits arrive during a review, notify without automatically refreshing the diff.

---

# 9. Review Workflow

## 9.1 Review States

Suggested internal states:

```text
Needs Review
    ↓
In Progress
    ↓
Draft Feedback
    ↓
Feedback Submitted
    ↓
Agent Queued / Running
    ↓
Agent Completed
    ↓
Waiting for CI
    ↓
Ready for Re-review
    ↓
Completed / Approved
    ↓
Merged
```

Also support:

- Action Required
- Blocked
- Agent Failed
- Closed Without Merge

Keep GitHub PR states, local review states, and agent task states logically separate.

## 9.2 Draft-First Feedback

- Comments are initially local drafts.
- Drafts can be edited or deleted.
- Comments may be inline or standalone.
- Send to Agent submits a batch.
- GitHub receives published text feedback.
- Claude receives the complete actionable context.

## 9.3 Standalone Findings

Support findings that don't reference a specific code line.

Fields include:

- Description
- Reproduction steps
- Optional screenshots
- Category
- Validation status
- Resolution status

Screenshots remain local.

GitHub receives the textual findings and reproduction steps, while Claude can access local screenshots.

## 9.4 Review Rounds

Group review activity into numbered rounds.

Each round tracks:

- Base and head commit references
- Submitted comments
- Agent changes
- Resolution statuses
- Review completion
- Relevant commits

Default to showing the latest round expanded.

On re-review, show changes since the previous review baseline by default, with an option to see the full PR.

## 9.5 Finish Review

Provide a separate Finish Review action.

This records local review completion without requiring GitHub approval.

It must work for self-authored PRs, which GitHub generally does not permit users to approve themselves.

Completion XP is granted only once per PR.

---

# 10. AI Agent Architecture

## 10.1 Objective

Clicking Send to Agent should initiate the feedback implementation process with minimal user involvement.

The original PR-authoring agent does not need to remain running.

## 10.2 MVP Provider

Claude Code through the Claude Agent SDK.

Design an agent-provider abstraction for future integrations.

```ts
interface AgentProvider {
  startTask(input: AgentTaskInput): Promise<AgentTask>;
  getTask(taskId: string): Promise<AgentTask>;
  requestStop(taskId: string): Promise<void>;
  resumeTask(taskId: string): Promise<AgentTask>;
  respondToQuestion(
    taskId: string,
    response: AgentResponse
  ): Promise<void>;
}
```

The final adapter must reflect supported SDK features rather than assuming every provider supports identical operations.

## 10.3 Task Context

A new agent should receive:

- Local repository path
- PR identity and GitHub URL
- PR description
- Base/head branches
- Relevant commits
- Changed files
- Submitted review findings
- Exact file and line context
- Prior review discussions
- Previous agent outcomes
- Current worktree state
- Repository instructions, including `CLAUDE.md`
- Confirmed test requirements
- Allowed tools and permissions

A fresh agent should be able to understand and address the feedback without recovering the original authoring conversation.

## 10.4 Execution Workflow

1. User submits feedback.
2. PReview publishes the review to GitHub.
3. PReview creates an agent task.
4. Task enters the execution queue.
5. PReview prepares the isolated worktree.
6. Claude receives the relevant context.
7. Claude investigates and implements fixes.
8. Claude runs required checks.
9. Claude reports findings and completion status.
10. Authorized changes are committed and pushed.
11. PReview monitors GitHub CI.
12. PR becomes Ready for Re-review when required checks pass.

## 10.5 Concurrency

Default to two concurrent agent tasks.

- Configurable global limit
- FIFO queue by default
- Manual queue ordering
- Different PRs can execute concurrently
- Only one writer per PR worktree
- Queued tasks automatically start when capacity becomes available

## 10.6 Failures and Recovery

Allow up to two automatic recovery attempts for execution failures.

When retries are exhausted:

- Stop execution.
- Preserve the worktree.
- Preserve changes.
- Preserve logs and checkpoints.
- Display an actionable failure summary.
- Require user action before further attempts.

For GitHub CI failures after pushing, do not automatically relaunch Claude. Offer Investigate with Claude instead.

## 10.7 Stopping and Resuming

On Stop:

- Request graceful cancellation.
- Preserve current progress.
- Preserve uncommitted changes.
- Offer Force Stop when necessary.

On Resume:

- Inspect worktree state.
- Reuse the previous session when supported.
- Otherwise launch a fresh session with saved task context.
- Avoid repeating commits or edits.

## 10.8 Runtime Notifications

When an agent runs longer than 25 minutes:

- Notify the user.
- Allow inspecting activity.
- Allow stopping or pausing where supported.
- Allow continuing.

No automatic timeout.

Do not impose per-task token or cost limits.

Display usage metrics if readily available from the SDK.

## 10.9 Agent Progress

Provide a live activity feed with:

- Current status
- Tool executions
- Modified files
- Test outcomes
- Recent actions
- Concise progress updates
- Failures and blockers

Technical logs may be expanded when troubleshooting.

Do not display private model reasoning or assume reasoning traces are accessible.

## 10.10 Interactive Clarifications

When genuinely blocked, an agent may ask the user a question through PReview.

Present questions within the existing Action Required Inbox workflow.

Support:

- Text responses
- Structured choices where applicable
- Pending status
- Resume after response

Only the blocked agent pauses.

Unrelated agents continue.

## 10.11 Agent Permissions

Use a trusted, constrained development environment.

Allow normal development operations inside approved worktrees:

- Read project files
- Edit project files
- Run tests
- Execute permitted build commands
- Install dependencies when allowed by repository policy

Require explicit permission for:

- Destructive operations
- Unapproved external services
- Filesystem access outside approved directories
- Operations violating repository policy

Enforce boundaries in actual tool permissions and execution controls, not only in prompts.

---

# 11. MCP Integration

## 11.1 Purpose

Allow compatible AI agents to retrieve PReview state and report actions through a structured interface.

MCP complements direct Claude Agent SDK execution; it does not replace the execution manager.

## 11.2 Proposed MCP Tools

```text
get_pending_reviews
get_review_details
get_review_comments
get_review_rounds
get_finding_details
acknowledge_finding
reject_finding
report_finding_fix
report_task_progress
report_task_completion
request_re_review
request_clarification
get_agent_task_status
```

Design tools around stable, typed identifiers.

## 11.3 Access Restrictions

An AI agent must not be able to:

- Award XP directly
- Approve its own work
- Merge PRs without user action
- Resolve findings on behalf of the reviewer
- Bypass required permissions
- Arbitrarily modify unrelated application state

## 11.4 Communication Model

Support two-way communication.

- PReview dispatches feedback.
- Agents retrieve task information.
- Agents report progress and results.
- PReview displays those updates.
- Agents can request clarification.
- PReview routes user responses back to the agent.

When an agent is unavailable, queue relevant work and dispatch through the execution manager.

## 11.5 Security

Prefer local transport where appropriate.

HTTP-based endpoints, if introduced, must have explicit authentication, origin restrictions, and limited exposure.

Do not expose a privileged unauthenticated MCP endpoint to arbitrary local or remote clients.

---

# 12. Gamification System

## 12.1 Progression Layers

Two distinct progression systems:

### Account Progression

- Global account level
- Global XP
- Character unlock milestones
- Achievements
- Long-term review statistics
- Weekly streaks

### Character Progression

- Individual character level
- Individual XP
- Character-specific outfits
- Animations
- Cosmetic rewards

## 12.2 Character XP Assignment

Only one character receives XP from a PR.

The assigned character is determined when the user begins reviewing the PR.

Changing the active companion later does not reassign that PR's XP.

The global account receives its own corresponding XP.

## 12.3 XP Awards

Proposed starting values:

| Action | Base XP |
|---|---:|
| Validated bug resolved | 50 |
| Validated improvement resolved | 25 |
| Security finding resolved | 100 |
| UI bug resolved | 60 |
| Completed review | 20 |

These values are initial balancing constants and may change before release.

A finding earns XP only after:

1. The agent validates the issue.
2. The user confirms the resolution.

An individual comment can earn XP independently.

Do not automatically group duplicate findings for XP purposes in the MVP.

## 12.4 Review Completion XP

- Award once per PR.
- Self-authored PRs are eligible.
- Repeated review rounds do not generate additional completion XP.
- Finishing the review is independent of GitHub approval.

## 12.5 Active Review Time Multiplier

XP scales based on active review time.

Maximum multiplier: **1.5×**.

Suggested starting brackets:

| Active review time | Multiplier |
|---|---:|
| Under 5 minutes | 1.0× |
| 5–15 minutes | 1.1× |
| 15–30 minutes | 1.25× |
| 30–60 minutes | 1.4× |
| 60+ minutes | 1.5× |

Only count meaningful active review time.

Exclude idle, background, and unfocused periods.

Final thresholds may be adjusted during balancing.

The multiplier should use a stable, documented snapshot or calculation for each reward so later review activity does not repeatedly increase previously awarded XP.

## 12.6 Reward Accounting

Record every XP transaction with:

- Reason
- Amount
- Multiplier
- PR
- Finding, when applicable
- Assigned character
- Timestamp
- Unique reward identity

Prevent accidental duplicate transactions caused by network retries or synchronization.

This is separate from intentionally awarding different comments individually.

## 12.7 Abandoned PRs

XP already earned remains permanent even if the PR is later closed without merging.

Never automatically revoke previously earned progression because of PR outcome.

## 12.8 Weekly Streaks

A weekly streak increases when the user completes at least one eligible PR review during the week.

No daily streak requirements.

Streak calculations should use a consistent calendar-week definition and user timezone.

## 12.9 Achievement Engine

Use predefined milestone conditions.

Examples:

- First Review
- First Bug Caught
- 10 Reviews Completed
- 25 Bugs Caught
- 50 Improvements Suggested
- 10-Week Streak
- 100 Reviews Completed

Achievement definitions should be data-driven.

Unlock achievements automatically when their conditions are satisfied.

Do not implement AI-generated achievements or special recurring challenges in the MVP.

---

# 13. Character System

## 13.1 MVP Roster

Launch with four characters.

- Shadow, the ninja, is unlocked initially.
- Three additional characters unlock through account progression.

Final names and art assets for the remaining characters can be finalized during asset production.

## 13.2 Progression

- Linear character progression
- Fixed XP requirement per level
- Individual character levels
- Automatic cosmetic unlocks
- Account-level character unlocks
- All themes available from the beginning

No currency or token-based shop.

## 13.3 Character Customization

MVP:

- Complete predefined outfits
- Outfit selection
- Different animations
- Cosmetic unlocks

Future:

- Interchangeable accessories
- Layered equipment sprites
- More complex visual customization

## 13.4 Sprite System

Use sprite sheets with structured animation metadata.

Example:

```ts
interface SpriteAnimation {
  name: string;
  frameWidth: number;
  frameHeight: number;
  frames: number[];
  frameDurationMs: number;
  loop: boolean;
}
```

All assets must use consistent scale, positioning, and animation definitions.

## 13.5 Animation Events

Characters react to:

- Idle activity
- Adding findings
- Submitting feedback
- Agent completion
- XP awards
- Level-ups
- Achievement unlocks
- PR merges

Animations must not interfere with code reviewing.

## 13.6 Celebration Behavior

During reviews:

- Small, non-disruptive character reactions
- No full-screen celebration
- No celebration overlays in Zen Mode

After merging:

- Full results/celebration experience
- XP summary
- Unlocks
- Achievements
- Character progression

## 13.7 Art Production

Use AI-assisted character concepts followed by manual refinement.

Final sprites should be consistent, intentionally designed, and suitable for frame-based animation.

Avoid directly using inconsistent generated frames as finished animation assets.

---

# 14. Notifications

## 14.1 Notification Events

Notify for:

- New PRs requiring attention
- Agent clarification requests
- Agent permission requests
- Agent execution failures
- Agent completion and re-review readiness
- Required CI failures after agent pushes
- Long-running agents
- Achievements and milestones

## 14.2 Notification Delivery

Support:

- In-app notification badges
- Desktop notifications
- Inbox status changes

Do not navigate the user away from the active screen when an event arrives.

## 14.3 Exclusions

Avoid unnecessary notifications for:

- Writing comments
- Marking files reviewed
- Finishing one's own review
- Routine review actions
- Weekly summaries

---

# 15. Offline Behavior

## 15.1 Supported Offline Actions

When offline, users can:

- Open locally available reviews
- Browse cached diffs
- Browse local repository code
- Write draft comments
- Add standalone findings
- Navigate existing review history

## 15.2 Queued Submissions

Store outbound operations durably.

On reconnection:

1. Refresh the PR revision.
2. Check whether comments are still valid.
3. Reattach references where reliable.
4. Flag outdated or ambiguous comments.
5. Require user correction when needed.
6. Submit safely.
7. Prevent duplicate publication.

Agent dispatch requiring GitHub publication must wait until publication succeeds.

---

# 16. Data Persistence

## 16.1 SQLite

Use SQLite as PReview's persistent local store.

Enable and verify foreign-key enforcement.

Use WAL mode where appropriate.

Manage schema changes through versioned migrations.

## 16.2 Suggested Tables

```text
accounts
github_connections
watched_folders
repositories
pull_requests
review_sessions
review_rounds
reviewed_files
review_findings
review_comments
review_attachments
agent_tasks
agent_task_events
agent_questions
submission_queue
characters
character_unlocks
character_progress
account_progress
xp_transactions
achievements
earned_achievements
notification_events
application_settings
backup_records
```

These are initial conceptual entities, not a finalized normalized schema.

## 16.3 Key Relationships

```text
Repository
  └── Pull Requests
       ├── Review Sessions
       │    ├── Review Rounds
       │    ├── Reviewed Files
       │    └── Draft Findings
       ├── Agent Tasks
       └── XP Transactions

Account
  ├── Account Progress
  ├── Character Collection
  │    └── Character Progress
  ├── Earned Achievements
  └── Notification Events
```

Use durable identifiers and foreign keys where appropriate.

## 16.4 Data Ownership

Store locally:

- Application settings
- Review drafts
- Review sessions
- PR metadata
- Agent task state
- Agent checkpoints
- XP transactions
- Character progression
- Achievements
- Notification state
- Screenshot attachments

Fetch from GitHub as needed:

- Full historical PR diffs
- Published discussions
- Commit metadata
- CI statuses
- Merge state

Do not store unnecessary complete agent logs or full historical diffs indefinitely.

## 16.5 Backups

- Automatic local SQLite backups
- Retain recent snapshots
- Manual export
- Manual restore
- Consistent database snapshots
- Backup validation where feasible

Do not require cloud storage.

---

# 17. Security

## 17.1 Electron

- Enable context isolation.
- Disable Node.js integration in the renderer.
- Use a restricted preload bridge.
- Validate IPC inputs.
- Apply a restrictive Content Security Policy.
- Keep privileged operations in the backend.
- Avoid unsafe remote content execution.
- Validate external links before opening.

## 17.2 Credentials

- Use OS-backed secure credential storage.
- Never store OAuth tokens in plaintext SQLite.
- Never expose tokens to the renderer unnecessarily.
- Redact secrets from logs.
- Support revocation and reauthorization.

## 17.3 Git & Agent Safety

- Restrict agent filesystem access.
- Validate allowed worktree paths.
- Prevent unsafe traversal and symlink escape.
- Avoid shell command construction from untrusted strings.
- Enforce repository-level permissions.
- Never trust agent-reported completion without verification.
- Preserve user work and Git history.

## 17.4 Untrusted Content

Treat PR descriptions, comments, repository files, and agent output as untrusted input.

An agent must not treat instructions embedded in a PR comment or source file as authorization to bypass PReview's permission boundaries.

---

# 18. Testing Strategy

## 18.1 Unit Tests

Cover:

- XP calculation
- Multipliers
- Achievement evaluation
- Character progression
- Review state transitions
- File-reviewed status
- Comment mapping
- Queue prioritization
- Retry policies
- Validation rules

## 18.2 Integration Tests

Cover:

- SQLite persistence
- GitHub provider adapter
- Git worktree operations
- Review publishing
- Agent dispatch
- MCP tools
- Notification events
- Recovery workflows

Use mocked GitHub and agent responses where appropriate.

## 18.3 UI Tests

Cover:

- Dashboard navigation
- Inbox filtering
- Diff switching
- Comment drafting
- Zen Mode
- Character selection
- Settings
- Post-merge results

## 18.4 End-to-End Tests

Test major workflows:

1. Repository discovered.
2. PR appears in Inbox.
3. User reviews and drafts findings.
4. Feedback published.
5. Claude starts in a worktree.
6. Agent implements fixes.
7. Changes pushed.
8. CI completes.
9. User re-reviews.
10. User verifies findings.
11. XP awarded.
12. PR merged.
13. Results celebration displayed.
14. Worktree safely cleaned up.

---

# 19. Performance Requirements

Performance should be treated as a first-class requirement.

Priorities:

- Smooth diff scrolling
- Responsive navigation
- Fast file switching
- Efficient repository scanning
- Minimal unnecessary network traffic
- Controlled background polling
- Low-cost idle sprite animations
- Avoid excessive SQLite queries
- Avoid unnecessary React re-renders

Use measurement and profiling rather than premature optimization.

Large PRs must not require rendering every changed file simultaneously.

---

# 20. Platform Support & Packaging

## 20.1 Supported Platforms

MVP:

- Windows
- macOS

Deferred:

- Linux

## 20.2 Installation

Provide platform-appropriate installers and application packaging.

## 20.3 Updates

- Automatically check for updates.
- Download updates when available.
- Prompt the user before installing.
- Never restart automatically during active agent execution.
- Preserve review sessions across updates.

Installer signing, distribution, and update hosting must be resolved before public release.

## 20.4 System Tray

Closing the window hides PReview to the system tray and allows running agents to continue.

Explicit Quit terminates the application after warning about active agents.

---

# 21. MVP Exclusions

Do not implement the following unless separately approved:

- Full IDE editing
- Merge-conflict resolution
- Git branch management beyond required PR/worktree operations
- GitLab or Azure DevOps integrations
- Multiple GitHub accounts
- Fork PR support
- Remote-only PR reviewing
- Automatic repository cloning
- Cloud account synchronization
- Multiplayer or leaderboards
- Character-to-agent assignments
- Virtual pet mechanics
- Interchangeable sprite accessories
- Token shops or in-game currency
- Vim emulation
- Language-server navigation
- Integrated application browser preview
- Development server launcher
- AI-generated achievements
- Automatic AI reviews on every PR
- Automatic agent reactions to failing CI without user authorization
- Full historical diff retention
- Advanced visual image diff sliders
- Unrestricted agent autonomy

---

# 22. Implementation Phases

The following phases represent logical delivery milestones, not fixed schedules.

## Phase 1 — Foundation

- Initialize Electron/React/Vite/TypeScript
- Configure CSS Modules
- Establish Base UI integration
- Implement application shell
- Configure TanStack Router
- Configure TanStack Query
- Establish typed IPC
- Initialize SQLite and migrations
- Configure logging and testing

**Acceptance:** Application launches on Windows and macOS with working navigation and persistence.

## Phase 2 — GitHub & Repository Discovery

- OAuth Device Flow
- Secure credential storage
- Watched folders
- Recursive Git detection
- Repository configuration
- GitHub provider adapter
- PR discovery and synchronization
- Inbox implementation

**Acceptance:** Locally available GitHub repositories and eligible PRs appear correctly in the Inbox.

## Phase 3 — Review Workspace

- Monaco integration
- Combined diffs
- File tree
- On-demand loading
- Comments and drafts
- Standalone findings
- Review sessions
- File-reviewed tracking
- Review submission
- GitHub threads
- Zen Mode
- Keyboard shortcuts
- Repository text search

**Acceptance:** Users can complete a real review entirely inside PReview.

## Phase 4 — Agent Integration

- Claude Agent SDK integration
- Agent task queue
- Isolated worktrees
- Context packaging
- Feedback dispatch
- Progress events
- Interactive questions
- Test execution
- Safe push handling
- CI monitoring
- Retry and recovery
- MCP integration

**Acceptance:** Clicking Send to Agent can result in a completed fix and re-review request without manually launching Claude.

## Phase 5 — Gamification

- Account XP
- Character XP
- Reward transaction ledger
- Active review timer
- Achievements
- Streaks
- Character unlocks
- Sprite animation engine
- Outfits
- Dashboard statistics
- Post-merge celebration

**Acceptance:** Verified review contributions update progression correctly, and character animations respond to events.

## Phase 6 — Reliability & Release

- Offline queue
- Synchronization recovery
- Automatic backups
- App crash recovery
- Notification refinement
- Large PR optimization
- Security review
- Full end-to-end testing
- Packaging
- Application updates

**Acceptance:** PReview safely preserves work, recovers from interruptions, and operates reliably on supported platforms.

---

# 23. Core Acceptance Criteria

PReview's MVP is complete when:

- [ ] The application installs and launches on Windows and macOS.
- [ ] GitHub OAuth authentication works.
- [ ] Watched folders automatically discover eligible repositories.
- [ ] Tracked PRs appear in a functional Inbox.
- [ ] Monaco displays usable side-by-side and unified diffs.
- [ ] Users can review files, create drafts, and publish feedback.
- [ ] Review sessions persist across restarts.
- [ ] GitHub discussions can be read and managed.
- [ ] Zen Mode functions as approved.
- [ ] Send to Agent launches Claude with sufficient PR context.
- [ ] Agents work in isolated Git worktrees.
- [ ] Agent progress, questions, and errors appear inside PReview.
- [ ] Safe automatic pushes and CI monitoring work.
- [ ] Re-review mode focuses on new changes.
- [ ] Findings can be validated and user-verified.
- [ ] XP is awarded without duplicate transactions.
- [ ] Characters level up independently.
- [ ] Achievements unlock correctly.
- [ ] Context-aware sprite animations work.
- [ ] The approved post-merge celebration works.
- [ ] Offline drafts and queued submissions survive restarts.
- [ ] Backups and crash recovery work.
- [ ] All nine approved visual designs are represented in the application.

---

# 24. Agent Implementation Instructions

When implementing PReview:

1. Read this entire specification before making architectural decisions.
2. Inspect all approved design references.
3. Preserve the confirmed technology stack.
4. Do not add out-of-scope features.
5. Prefer existing libraries over rebuilding established functionality.
6. Keep GitHub-specific code separate from application domain logic.
7. Keep AI-provider-specific code separate from agent workflow logic.
8. Enforce permissions at execution boundaries.
9. Make persistent workflows recoverable and idempotent.
10. Never sacrifice review correctness for gamification.
11. Implement complex features incrementally with automated tests.
12. Keep visual components reusable and styling maintainable.
13. Avoid introducing needless abstractions or microservices.
14. Clearly identify any functionality that cannot be implemented as specified with the chosen APIs.
15. Do not silently substitute different product behavior when technical constraints arise.
16. Prefer secure, dependable behavior over aggressive automation.
17. Preserve all previously completed user work.
18. Treat the approved screen designs as the visual baseline, not as an excuse to add decorative or unnecessary functionality.

---

# 25. Technical Details Requiring Implementation Validation

The following are engineering validation items, not invitations to reopen the product questionnaire.

- Confirm GitHub OAuth Device Flow support and required authorization scopes.
- Verify GitHub discussion-thread resolution and reopening API behavior.
- Determine the safest supported Claude Agent SDK stop/resume behavior.
- Validate secure local MCP transport and client authorization.
- Select compatible Electron SQLite bindings and packaging configuration.
- Confirm application signing and update distribution requirements for Windows and macOS.
- Validate comment anchoring across GitHub diff revisions.
- Confirm reliable local-agent screenshot access without leaking absolute paths.
- Ensure worktree cleanup cannot discard unsaved changes.
- Verify how GitHub required CI checks are identified.
- Validate the chosen sprite-sheet rendering approach.
- Tune review-time XP multipliers against real usage.
- Ensure repository-supplied test commands cannot bypass configured agent permissions.

Where API constraints prevent exact functionality, document the limitation and propose the smallest safe implementation alternative.

---

# 26. Product Definition

**PReview is a code review application first and a game second.**

The final product should make reviewing AI-generated code feel productive, engaging, and visually rewarding.

Users should be able to open the application, identify what needs review, inspect code, leave feedback, have Claude implement fixes, verify the results, and earn meaningful progression rewards—all without managing multiple development tools or agent sessions.

The application should feel polished, focused, fast, and enjoyable while maintaining strong technical boundaries and reliable review workflows.

