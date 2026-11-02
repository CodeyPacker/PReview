import { existsSync } from 'node:fs';
import { join } from 'node:path';

// The Claude Code binary ships in a per-platform package next to the SDK. In development the
// SDK finds it on its own. A packaged app keeps it outside the asar archive, since a binary
// can't run from inside one, so the SDK has to be pointed at it.
export function claudeExecutable(
  isPackaged: boolean,
  resourcesPath = process.resourcesPath,
): string | undefined {
  if (!isPackaged) return undefined;
  const name = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const modules = join(resourcesPath, 'app.asar.unpacked', 'node_modules');
  // Hoisted, or nested under the SDK when the package manager kept it there.
  return [
    join(modules, name, binary),
    join(modules, '@anthropic-ai', 'claude-agent-sdk', 'node_modules', name, binary),
  ].find((path) => existsSync(path));
}
