import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { ReviewThread } from '../../../shared/contracts/pull-request-reviews.ts';
import {
  findingCategoryLabels,
  type FindingCategory,
} from '../../../shared/contracts/review-findings.ts';
import { agentReportSchema } from '../../agents/provider.ts';
import type {
  GitProvider,
  ProviderFilePatch,
  ProviderReviewComment,
} from '../../providers/types.ts';

// Everything a fresh agent needs to work on one submitted review.
export interface TaskContext {
  repository: string;
  number: number;
  title: string;
  url: string;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  description: string;
  files: ProviderFilePatch[];
  summary: string;
  comments: ProviderReviewComment[];
  findings: {
    category: FindingCategory;
    description: string;
    steps: string;
    screenshotIds: number[];
  }[];
  // Unresolved discussions other than this review's own comments.
  threads: ReviewThread[];
  // The summaries of earlier agent runs on the pull request, oldest first.
  earlierRuns: string[];
}

// Rules every agent gets, on top of Claude Code's own.
export const AGENT_INSTRUCTIONS = [
  'You are working on review feedback for a pull request in PReview.',
  'Work only in the current folder. It is a checkout of the pull request at the reviewed commit.',
  'Do not commit, push or change branches. PReview commits and pushes your changes.',
  'Git is not available, and the network only reaches the npm and Yarn registries. Use the get_file_diff tool to see what the pull request changed in a file.',
  'Make the fix first. Then search for tests that cover what you changed, before installing anything.',
  'If tests cover it, run only those tests, not the whole suite. If none do, do not install dependencies or run tests. CI checks every pushed commit.',
  'If an item is unclear or needs a decision from the reviewer, leave it and mark it needs_input with your question.',
].join('\n');

export class TaskNotFoundError extends Error {}

// Reads the task's review from the database and the rest from the provider.
export async function loadTaskContext(
  db: DatabaseSync,
  provider: GitProvider,
  taskId: number,
): Promise<TaskContext> {
  const row = db
    .prepare(
      `SELECT t.pull_request_id, s.head_sha, s.body, s.comments, s.finding_ids,
              p.number, p.title, p.url, p.head_branch, p.base_branch,
              r.github_owner, r.github_name
       FROM agent_tasks t
       JOIN review_submissions s ON s.id = t.submission_id
       JOIN pull_requests p ON p.id = t.pull_request_id
       JOIN repositories r ON r.id = p.repository_id
       WHERE t.id = ?`,
    )
    .get(taskId) as
    | {
        pull_request_id: number;
        head_sha: string;
        body: string;
        comments: string;
        finding_ids: string;
        number: number;
        title: string;
        url: string;
        head_branch: string;
        base_branch: string;
        github_owner: string | null;
        github_name: string | null;
      }
    | undefined;
  if (!row?.github_owner || !row.github_name) throw new TaskNotFoundError('Task not found.');
  const repository = `${row.github_owner}/${row.github_name}`;
  const comments = JSON.parse(row.comments) as ProviderReviewComment[];

  const [details, threads] = await Promise.all([
    provider.getPullRequestDetails(repository, row.number),
    provider.getReviewThreads(repository, row.number),
  ]);
  const findings = db
    .prepare(
      `SELECT f.category, f.description, f.steps,
              (SELECT json_group_array(s.id) FROM finding_screenshots s WHERE s.finding_id = f.id)
                AS screenshot_ids
       FROM review_findings f
       WHERE f.id IN (SELECT value FROM json_each(?)) ORDER BY f.id`,
    )
    .all(row.finding_ids) as {
    category: FindingCategory;
    description: string;
    steps: string;
    screenshot_ids: string;
  }[];
  const earlierRuns = (
    db
      .prepare(
        `SELECT result FROM agent_tasks
         WHERE pull_request_id = ? AND id < ? AND result IS NOT NULL ORDER BY id`,
      )
      .all(row.pull_request_id, taskId) as { result: string }[]
  ).map(({ result }) => agentReportSchema.parse(JSON.parse(result)).summary);

  // This review's comments come back as threads once published. Leave those out.
  const ownComment = (thread: ReviewThread) =>
    comments.some(
      (comment) =>
        comment.path === thread.path &&
        comment.line === thread.line &&
        comment.body === thread.comments[0]?.body,
    );
  return {
    repository,
    number: row.number,
    title: row.title,
    url: row.url,
    baseBranch: row.base_branch,
    headBranch: row.head_branch,
    headSha: row.head_sha,
    description: details.description.trim(),
    files: details.files,
    summary: row.body,
    comments,
    findings: findings.map(({ screenshot_ids, ...finding }) => ({
      ...finding,
      screenshotIds: JSON.parse(screenshot_ids) as number[],
    })),
    threads: threads.filter(
      (thread) => !thread.resolved && !thread.outdated && !ownComment(thread),
    ),
    earlierRuns,
  };
}

const STATUS_LETTERS: Record<ProviderFilePatch['status'], string> = {
  added: 'A',
  removed: 'D',
  modified: 'M',
  renamed: 'R',
  copied: 'C',
  changed: 'M',
};

function lines(startLine: number | null, line: number | null): string {
  if (line === null) return 'the whole file';
  return startLine === null ? `line ${line}` : `lines ${startLine}-${line}`;
}

// The task's first message. Kept short to save tokens: the changed files are listed without
// their diffs, which the agent asks for with get_file_diff when it needs them.
export function taskPrompt(context: TaskContext): string {
  const sections = [
    `# Task\n\nAddress the review feedback on pull request ${context.repository}#${context.number}, "${context.title}".\n${context.url}\nBranch ${context.headBranch} at ${context.headSha}, into ${context.baseBranch}.`,
  ];
  if (context.description) sections.push(`## Description\n\n${context.description}`);
  sections.push(
    `## Changed files\n\n${context.files
      .map((file) => {
        const renamed = file.previousPath ? ` (from ${file.previousPath})` : '';
        return `- ${STATUS_LETTERS[file.status]} ${file.path}${renamed} +${file.additions} -${file.deletions}`;
      })
      .join('\n')}`,
  );

  const feedback = ['## Review feedback'];
  if (context.summary) feedback.push(`Summary from the reviewer:\n\n${context.summary}`);
  if (context.comments.length > 0) {
    feedback.push(
      `### Line comments\n\n${context.comments
        .map(
          (comment, index) =>
            `C${index + 1}. ${comment.path}, ${lines(comment.startLine, comment.line)} of the ${
              comment.side === 'original' ? 'old' : 'new'
            } version:\n${comment.body}`,
        )
        .join('\n\n')}`,
    );
  }
  if (context.findings.length > 0) {
    feedback.push(
      `### Findings\n\n${context.findings
        .map((finding, index) => {
          const steps = finding.steps ? `\nSteps to reproduce:\n${finding.steps}` : '';
          const screenshots =
            finding.screenshotIds.length > 0
              ? `\nScreenshots, for the get_finding_screenshot tool: ${finding.screenshotIds.join(', ')}`
              : '';
          return `F${index + 1}. ${findingCategoryLabels[finding.category]}: ${finding.description}${steps}${screenshots}`;
        })
        .join('\n\n')}`,
    );
  }
  sections.push(feedback.join('\n\n'));

  if (context.threads.length > 0) {
    sections.push(
      `## Other open discussions\n\n${context.threads
        .map((thread) => {
          const said = thread.comments
            .map((comment) => `${comment.author?.login ?? 'someone'}: ${comment.body}`)
            .join('\n');
          return `- ${thread.path}, ${lines(thread.startLine, thread.line)}:\n${said}`;
        })
        .join('\n\n')}`,
    );
  }
  if (context.earlierRuns.length > 0) {
    sections.push(
      `## Earlier agent runs on this pull request\n\n${context.earlierRuns
        .map((summary) => `- ${summary}`)
        .join('\n')}`,
    );
  }
  sections.push(
    '## When you finish\n\nReport every line comment and finding by its id (C1, F1 and so on): fixed, not_fixed with the reason, or needs_input with your question. List the test commands you ran and whether they passed. If you ran none, say in your summary that no tests cover the change.',
  );
  return sections.join('\n\n');
}

// Lockfiles and the command that installs exactly what each one lists.
const INSTALL_COMMANDS: [string, string][] = [
  ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
  ['yarn.lock', 'yarn install --frozen-lockfile'],
  ['package-lock.json', 'npm ci'],
  ['bun.lock', 'bun install --frozen-lockfile'],
  ['bun.lockb', 'bun install --frozen-lockfile'],
];

// Tells the agent to install the project's dependencies when the worktree has none, so it can
// run the tests. Null when there is nothing to install.
export function dependencySetup(worktree: string): string | null {
  if (!existsSync(join(worktree, 'package.json'))) return null;
  if (existsSync(join(worktree, 'node_modules'))) return null;
  const command =
    INSTALL_COMMANDS.find(([lockfile]) => existsSync(join(worktree, lockfile)))?.[1] ??
    'npm install';
  return `## Setup\n\nDependencies aren't installed. If you need to run tests, run \`${command}\` first. Otherwise skip it.`;
}

// What get_file_diff answers for a path.
export function fileDiff(files: ProviderFilePatch[], path: string): string {
  const file = files.find((item) => item.path === path || item.previousPath === path);
  if (!file) return `${path} is not changed by this pull request.`;
  if (file.patch === null) return `GitHub shows no diff for ${file.path}. Read the file instead.`;
  return `${file.path}\n${file.patch}`;
}
