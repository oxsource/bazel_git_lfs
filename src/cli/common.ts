import { existsSync } from 'node:fs';
import { projectConfigDir } from '@/config/paths';
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

/** The initialized-config-area precondition (FR-013). */
export function checkInitialized(projectDir: string): GuardResult {
  if (!existsSync(projectConfigDir(projectDir))) {
    return { ok: false, error: NOT_INITIALIZED_MESSAGE(projectDir) };
  }
  return { ok: true };
}

/** The persisted-snapshot precondition (FR-013). */
export function checkSnapshot(projectDir: string): GuardResult {
  if (!existsSync(new FsSnapshotStore().snapshotPath(projectDir))) {
    return { ok: false, error: NO_SNAPSHOT_MESSAGE };
  }
  return { ok: true };
}

/**
 * The effective-default-remote-profile precondition for pull/push (FR-012).
 * Stage 1's ConfigError message already names the missing configuration.
 */
export async function resolveDefaultRemote(
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
