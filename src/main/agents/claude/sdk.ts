import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { claudeEnvironment } from './environment.ts';
import { claudeExecutable } from './executable.ts';
import { InputQueue } from './input-queue.ts';

export type Sdk = typeof import('@anthropic-ai/claude-agent-sdk');

// The SDK is an ES module with a native binary, so it loads on first use.
export const loadSdk = (): Promise<Sdk> => import('@anthropic-ai/claude-agent-sdk');

// Options every session shares. Project settings stay off, since they can run hooks from the
// pull request's branch. PReview reads CLAUDE.md itself.
export function baseOptions(isPackaged: boolean, cwd: string): Options {
  return {
    cwd,
    env: claudeEnvironment(),
    pathToClaudeCodeExecutable: claudeExecutable(isPackaged),
    settingSources: [],
  };
}

export interface SignIn {
  signedIn: boolean;
  detail: string;
}

// Asks Claude Code who is signed in, without starting a conversation.
export async function checkSignIn(sdk: Sdk, options: Options): Promise<SignIn> {
  const idle = new InputQueue();
  const query = sdk.query({ prompt: idle, options: { ...options, persistSession: false } });
  try {
    const info = await query.accountInfo();
    const signedIn = Boolean(
      info.email ||
      info.subscriptionType ||
      info.organization ||
      (info.tokenSource && info.tokenSource !== 'none'),
    );
    return signedIn
      ? { signedIn, detail: `Signed in to Claude${info.email ? ` as ${info.email}` : ''}.` }
      : { signedIn, detail: 'Claude is not signed in. Run `claude` in a terminal and use /login.' };
  } finally {
    idle.end();
    query.close();
  }
}
