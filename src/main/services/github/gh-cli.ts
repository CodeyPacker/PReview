import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Thrown when the GitHub CLI can't hand out a token. The message is shown to the user.
export class GhCliError extends Error {}

// Reads the token the GitHub CLI holds for login, or for its active account when no login is
// given. Pinning the login keeps a terminal `gh auth switch` from changing the account PReview
// uses. The CLI keeps the token in the system keyring, so PReview never stores a copy.
export type GhToken = (login?: string) => Promise<string>;

// The arguments for `gh auth token`. Always github.com, since PReview supports no other host.
export function ghTokenArgs(login?: string): string[] {
  return ['auth', 'token', '--hostname', 'github.com', ...(login ? ['--user', login] : [])];
}

export const readGhToken: GhToken = async (login) => {
  const signedOut = login
    ? `The GitHub CLI is not signed in as ${login}. Run gh auth login and try again.`
    : 'The GitHub CLI is not signed in. Run gh auth login and try again.';
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('gh', ghTokenArgs(login), {
      timeout: 15_000,
      windowsHide: true,
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new GhCliError('The GitHub CLI is not installed. Install gh and try again.');
    }
    throw new GhCliError(signedOut);
  }
  const token = stdout.trim();
  if (!token) throw new GhCliError(signedOut);
  return token;
};
