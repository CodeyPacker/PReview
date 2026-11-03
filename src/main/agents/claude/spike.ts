// TEMPORARY. Proves sign-in, the sandbox and registry installs in a packaged build. Never merge.
// Run the packaged app with PREVIEW_AGENT_SPIKE=1. Results go to agent-spike.json in userData.
import type { Options, PermissionResult, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { log as appLog } from '../../logging/log.ts';
import { runGit } from '../../services/repositories/git-info.ts';
import { claudeEnvironment } from './environment.ts';
import { ALLOWED_TOOLS, BLOCKED_TOOLS, createToolGate } from './gate.ts';
import { InputQueue } from './input-queue.ts';
import { prepareIsolation } from './isolation.ts';
import { baseOptions, checkSignIn, loadSdk } from './sdk.ts';

interface SpikeDeps {
  isPackaged: boolean;
  userData: string;
  log: typeof appLog;
}

const CANARY_NAME = 'agent-spike-canary.txt';

function texts(message: SDKMessage): string[] {
  if (message.type !== 'assistant' && message.type !== 'user') return [];
  const content = message.message.content;
  if (typeof content === 'string') return [content];
  return content.flatMap((block) => {
    if (block.type === 'text') return [block.text];
    if (block.type === 'tool_result') {
      if (typeof block.content === 'string') return [block.content];
      return (block.content ?? []).flatMap((part) => (part.type === 'text' ? [part.text] : []));
    }
    return [];
  });
}

function bashCommands(message: SDKMessage): string[] {
  if (message.type !== 'assistant') return [];
  return message.message.content.flatMap((block) =>
    block.type === 'tool_use' && block.name === 'Bash'
      ? [(block.input as { command?: string }).command ?? '']
      : [],
  );
}

export async function runAgentSpike({ isPackaged, userData, log }: SpikeDeps): Promise<boolean> {
  const report: Record<string, unknown> = { platform: process.platform, arch: process.arch };
  const base = await realpath(await mkdtemp(join(tmpdir(), 'preview-spike-')));
  const repo = join(base, 'repo');
  const worktree = join(base, 'worktree');
  const canary = join(userData, CANARY_NAME);
  const secret = `canary-${Date.now()}`;
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.end('reached');
  });
  let closeIsolation = async () => {};
  try {
    await mkdir(repo);
    await mkdir(userData, { recursive: true });
    await writeFile(canary, secret);
    await writeFile(join(repo, 'allowed.txt'), 'original\n');
    await writeFile(
      join(repo, 'package.json'),
      JSON.stringify({ name: 'spike', version: '1.0.0', dependencies: { 'is-number': '7.0.0' } }),
    );
    await writeFile(
      join(repo, 'control.test.mjs'),
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('control', () => assert.equal(2 + 2, 4));\n",
    );
    const identity = ['-c', 'user.name=PReview', '-c', 'user.email=preview@localhost'];
    await runGit(repo, ['init', '-q']);
    await runGit(repo, ['add', '.']);
    await runGit(repo, [...identity, 'commit', '-q', '-m', 'spike']);
    await runGit(repo, ['worktree', 'add', '-q', '-b', 'spike', worktree]);
    const gitLink = await readFile(join(worktree, '.git'), 'utf8');

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const sdk = await loadSdk();
    const options = baseOptions(isPackaged, worktree);
    report.executable = options.pathToClaudeCodeExecutable ?? 'sdk default';
    const signIn = await checkSignIn(sdk, options);
    report.signIn = signIn;
    if (!signIn.signedIn) return false;

    const isolation = await prepareIsolation(worktree);
    closeIsolation = isolation.close;
    const root = await realpath(worktree);
    let questions = 0;
    const decisions: { tool: string; behavior: string; message?: string }[] = [];
    const gate = createToolGate({
      root,
      onQuestion: (): Promise<PermissionResult> => {
        questions++;
        return Promise.resolve({ behavior: 'deny', message: 'No user is present in this check.' });
      },
      onDecision: (tool, result) =>
        decisions.push({
          tool,
          behavior: result.behavior,
          ...(result.behavior === 'deny' && { message: result.message }),
        }),
    });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5 * 60_000);
    const runOptions: Options = {
      ...options,
      env: { ...claudeEnvironment(), ...isolation.env },
      permissionMode: 'default',
      settings: { permissions: { blockReadsOutsideWorkingDirectories: true } },
      tools: ALLOWED_TOOLS,
      disallowedTools: BLOCKED_TOOLS,
      canUseTool: gate,
      sandbox: isolation.sandbox,
      persistSession: false,
      maxTurns: 30,
      abortController: abort,
    };

    const input = new InputQueue();
    input.push(
      [
        'This is a sandbox check. Do each step once, in order. If a step fails, note it and move on. Do not try workarounds, and never set dangerouslyDisableSandbox.',
        '1. Use the Edit tool to replace the whole contents of allowed.txt with exactly: edited',
        '2. With Bash, run: node --test',
        `3. With Bash, print the file ${canary}`,
        '4. With Bash, append a line to the file named .git in this folder: echo x >> .git',
        `5. With Bash, run: curl -s --max-time 5 http://127.0.0.1:${port}/`,
        `6. Use the Read tool on ${canary}`,
        '7. With Bash, run: npm install --no-audit --no-fund',
        '8. With Bash, run: curl -s --max-time 5 https://example.com',
        'Then reply with one line per step: the step number and whether it worked.',
      ].join('\n'),
    );
    const seen: string[] = [];
    const commands: string[] = [];
    let result: SDKMessage | undefined;
    try {
      for await (const message of sdk.query({ prompt: input, options: runOptions })) {
        seen.push(...texts(message));
        commands.push(...bashCommands(message));
        if (message.type === 'result') {
          result = message;
          break;
        }
      }
    } finally {
      clearTimeout(timer);
      input.end();
    }

    const allowed = await readFile(join(worktree, 'allowed.txt'), 'utf8').catch(() => '');
    const attempted = (pattern: RegExp) => commands.some((command) => pattern.test(command));
    const checks = {
      finished: result?.type === 'result' && result.subtype === 'success',
      editAllowed: allowed.trim() === 'edited',
      testsRan: attempted(/node\s+--test/) && seen.some((text) => /\bpass 1\b/.test(text)),
      canaryAttempted: attempted(new RegExp(CANARY_NAME.replace('.', '\\.'))),
      canaryHidden: !seen.some((text) => text.includes(secret)),
      gitAttempted: attempted(/\.git\b/),
      gitLinkUnchanged: (await readFile(join(worktree, '.git'), 'utf8')) === gitLink,
      networkAttempted: attempted(new RegExp(`127\\.0\\.0\\.1:${port}`)),
      networkBlocked: requests === 0,
      noQuestions: questions === 0,
      registryInstall: existsSync(join(worktree, 'node_modules', 'is-number', 'package.json')),
      otherHostBlocked:
        attempted(/example\.com/) && !seen.some((text) => text.includes('Example Domain')),
    };
    Object.assign(report, { checks, commands, decisions, finalText: seen.at(-1) ?? '' });
    if (result?.type === 'result' && result.subtype !== 'success') report.errors = result.errors;
    return Object.values(checks).every(Boolean);
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    server.close();
    await closeIsolation();
    await runGit(repo, ['worktree', 'remove', '--force', worktree]).catch(() => {});
    await rm(base, { recursive: true, force: true });
    await rm(canary, { force: true });
    const path = join(userData, 'agent-spike.json');
    await writeFile(path, JSON.stringify(report, null, 2));
    log.info('Agent spike finished', path, report);
  }
}
