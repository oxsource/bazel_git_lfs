import { guard, type RemoteInfo } from '@/cli/common';
import { format, EXIT_ERROR } from '@/cli/format';

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

  for (const g of [guard.checkInitialized(projectDir), guard.checkSnapshot(projectDir)]) {
    if (!g.ok) {
      format.printResult({ ok: false, error: g.error }, { json: true });
      return EXIT_ERROR;
    }
  }

  const profile = await guard.resolveDefaultRemote(projectDir, opts.env);
  if (!profile.ok) {
    format.printResult({ ok: false, error: profile.error }, { json: true });
    return EXIT_ERROR;
  }

  try {
    return await run(projectDir, profile.remote);
  } catch (err) {
    format.printResult({ ok: false, error: (err as Error).message }, { json: true });
    return EXIT_ERROR;
  }
}
