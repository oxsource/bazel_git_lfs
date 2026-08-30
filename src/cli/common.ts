import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { paths } from '@/config/paths';
import { FsProfileStore, ConfigError } from '@/config/store';
import { ConfigResolver } from '@/config/resolve';
import { FsSnapshotStore } from '@/inspect/snapshot';
import { COMMANDS, TOOL_NAME } from '@/config/constants';

export const NOT_INITIALIZED_MESSAGE = (projectDir: string): string =>
  `Not a valid bazel_git_lfs project: ${projectDir}. Run "${TOOL_NAME} ${COMMANDS.INIT}" first.`;

export const NO_SNAPSHOT_MESSAGE =
  `no dependency snapshot, run "${TOOL_NAME} ${COMMANDS.INSPECT}" first`;

export interface RemoteInfo {
  alias: string;
  url: string;
}

export type GuardResult = { ok: true } | { ok: false; error: string };

/**
 * Walk up from cwd to find the project root (where .bazel_git_lfs/ exists).
 * Returns the root path or null if not found.
 */
export function findProjectRoot(cwd: string): string | null {
  let dir = resolve(cwd);
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

function checkSnapshot(projectDir: string): GuardResult {
  if (!existsSync(new FsSnapshotStore().snapshotPath(projectDir))) {
    return { ok: false, error: NO_SNAPSHOT_MESSAGE };
  }
  return { ok: true };
}

async function resolveDefaultRemote(
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<{ ok: true; remote: RemoteInfo } | { ok: false; error: string }> {
  try {
    const resolver = new ConfigResolver(new FsProfileStore());
    const effective = await resolver.resolveEffective({ cwd, env });
    return { ok: true, remote: { alias: effective.alias, url: effective.profile.url } };
  } catch (err) {
    if (err instanceof ConfigError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: (err as Error).message };
  }
}

export const guard = { checkInitialized, checkSnapshot, resolveDefaultRemote, findProjectRoot };
