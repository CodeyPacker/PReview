import { existsSync } from 'node:fs';
import { join } from 'node:path';

// The binary in `modules` from the SDK's package for one platform. Hoisted, or nested under
// the SDK when the package manager kept it there.
function findBinary(modules: string, target: string, binary: string): string | undefined {
  const name = `@anthropic-ai/claude-agent-sdk-${target}`;
  return [
    join(modules, name, binary),
    join(modules, '@anthropic-ai', 'claude-agent-sdk', 'node_modules', name, binary),
  ].find((path) => existsSync(path));
}

const packagedModules = (resourcesPath: string) =>
  join(resourcesPath, 'app.asar.unpacked', 'node_modules');

// The Claude Code binary ships in a per-platform package next to the SDK. In development the
// SDK finds it on its own. A packaged app keeps it outside the asar archive, since a binary
// can't run from inside one, so the SDK has to be pointed at it.
export function claudeExecutable(
  isPackaged: boolean,
  resourcesPath = process.resourcesPath,
): string | undefined {
  if (!isPackaged) return undefined;
  return findBinary(
    packagedModules(resourcesPath),
    `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'claude.exe' : 'claude',
  );
}

// The Linux build that Windows runs inside WSL. The SDK would pick the Windows one, so it's
// always named.
export function linuxClaudeExecutable(
  isPackaged: boolean,
  resourcesPath = process.resourcesPath,
): string {
  const modules = isPackaged ? packagedModules(resourcesPath) : join(process.cwd(), 'node_modules');
  const found = findBinary(modules, 'linux-x64', 'claude');
  if (!found) throw new Error(`The Linux Claude Code binary is missing under ${modules}.`);
  return found;
}
