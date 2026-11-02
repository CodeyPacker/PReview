// The variables Claude Code gets from the app's environment. Everything else, such as tokens
// for other services, stays out. Claude Code signs in with the user's own Claude login.
const ALLOWED = new Set([
  'HOME',
  'PATH',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'USER',
  'LOGNAME',
  'SHELL',
  // Windows
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'OS',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
]);

export function claudeEnvironment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    // Windows variable names are case-insensitive, such as Path and PATH.
    if (value !== undefined && ALLOWED.has(key.toUpperCase())) env[key] = value;
  }
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'preview';
  return env;
}
