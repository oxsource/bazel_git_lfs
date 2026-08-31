import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { paths } from '@/config/paths';
import { COMMANDS, TOOL_NAME } from '@/config/constants';

export const NOT_INITIALIZED_MESSAGE = (projectDir: string): string =>
  `Not a valid bazel_git_lfs project: ${projectDir}. Run "${TOOL_NAME} ${COMMANDS.INIT}" first.`;

export type GuardResult = { ok: true } | { ok: false; error: string };

/**
 * Walk up from cwd to find the project root (where .bazel_git_lfs/ exists).
 * Returns the root path or null if not found.
 */
export function findProjectRoot(cwd: string): string | null {
  const dir = resolve(cwd);
  const parts = dir.split(sep);
  for (let i = parts.length; i > 0; i--) {
    const candidate = parts.slice(0, i).join(sep) || '/';
    if (existsSync(paths.projectConfigDir(candidate))) {
      return candidate;
    }
  }
  return null;
}

/** The initialized-config-area precondition (FR-013). */
function checkInitialized(projectDir: string): GuardResult {
  if (!existsSync(paths.projectConfigDir(projectDir))) {
    return { ok: false, error: NOT_INITIALIZED_MESSAGE(projectDir) };
  }
  return { ok: true };
}

export const guard = { checkInitialized, findProjectRoot };
