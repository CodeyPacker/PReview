export interface GitHubRepoName {
  owner: string;
  name: string;
}

interface RemoteParts {
  host: string;
  path: string;
}

// Reads both URL remotes (https://host/o/r.git, ssh://git@host/o/r) and scp-style remotes
// (git@host:o/r.git). Local paths and anything else read as undefined.
function parseRemote(remote: string): RemoteParts | undefined {
  const trimmed = remote.trim();
  let host: string;
  let path: string;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      host = url.hostname;
      path = url.pathname;
    } catch {
      return undefined;
    }
  } else {
    const scp = /^(?:[^@/\s]+@)?([^:/\s]{2,}):(?!\/\/)(.+)$/.exec(trimmed);
    if (!scp?.[1] || !scp[2]) return undefined;
    host = scp[1];
    path = scp[2];
  }

  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  return host && path ? { host: host.toLowerCase(), path } : undefined;
}

// Removes the password, and the user name of an http(s) remote, which can be a token.
export function stripCredentials(remote: string): string {
  const trimmed = remote.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    url.password = '';
    if (url.protocol === 'http:' || url.protocol === 'https:') url.username = '';
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function githubRepoFromRemote(remote: string): GitHubRepoName | undefined {
  const parts = parseRemote(remote);
  if (!parts || (parts.host !== 'github.com' && parts.host !== 'www.github.com')) return undefined;
  const [owner, name, ...rest] = parts.path.split('/');
  return owner && name && rest.length === 0 ? { owner, name } : undefined;
}

// The same repository reads the same over https and ssh, in any case.
export function remoteIdentity(remote: string): string {
  const parts = parseRemote(remote);
  return (parts ? `${parts.host}/${parts.path}` : remote.trim()).toLowerCase();
}
