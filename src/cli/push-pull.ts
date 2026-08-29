import { checkInitialized, checkSnapshot, resolveDefaultRemote, type RemoteInfo } from '@/cli/common';
import { printResult, EXIT_ERROR } from '@/cli/format';

export interface PushPullCliOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Shared command flow for `push`/`pull` (JSON-only output per contracts/cli.md):
 * init-check → snapshot-check → default-profile-check → orchestrate.
 * The runner returns the process exit code; unexpected errors are reported
 * as JSON error objects with exit 1.
 */
export async function runPushPullCommand(
  opts: PushPullCliOptions,
  run: (projectDir: string, remote: RemoteInfo) => Promise<number>,
): Promise<number> {
  const projectDir = opts.cwd;

  for (const guard of [checkInitialized(projectDir), checkSnapshot(projectDir)]) {
    if (!guard.ok) {
      printResult({ ok: false, error: guard.error }, { json: true });
      return EXIT_ERROR;
    }
  }

  const profile = await resolveDefaultRemote(projectDir, opts.env);
  if (!profile.ok) {
    printResult({ ok: false, error: profile.error }, { json: true });
    return EXIT_ERROR;
  }

  try {
    return await run(projectDir, profile.remote);
  } catch (err) {
    printResult({ ok: false, error: (err as Error).message }, { json: true });
    return EXIT_ERROR;
  }
}
