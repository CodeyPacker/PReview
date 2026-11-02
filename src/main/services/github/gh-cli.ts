import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Thrown when the GitHub CLI can't hand out a token. The message is shown to the user.
export class GhCliError extends Error {}

// Reads the token the GitHub CLI holds for its active account. The CLI keeps the token in
// the system keyring, so PReview never stores a copy.
export type GhToken = () => Promise<string>;

export const readGhToken: GhToken = async () => {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('gh', ['auth', 'token'], {
      timeout: 15_000,
      windowsHide: true,
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new GhCliError('The GitHub CLI is not installed. Install gh and try again.');
    }
    throw new GhCliError('The GitHub CLI is not signed in. Run gh auth login and try again.');
  }
  const token = stdout.trim();
  if (!token) {
    throw new GhCliError('The GitHub CLI is not signed in. Run gh auth login and try again.');
  }
  return token;
};
