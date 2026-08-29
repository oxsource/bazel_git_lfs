import { existsSync } from 'node:fs';
import { projectConfigDir } from '@/config/paths';
import { FsProfileStore, ConfigError } from '@/config/store';
import { ConfigResolver } from '@/config/resolve';
import { FsSnapshotStore } from '@/inspect/snapshot';
import { printResult, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runPull, MissingSnapshotError } from '@/transfer/pull';

export interface PullCliOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * `pull` command entry (JSON-only output, per contracts/cli.md):
 * init-check → snapshot-check → default-profile-check → orchestrate.
 */
export async function runPullCommand(opts: PullCliOptions): Promise<number> {
  const projectDir = opts.cwd;

  if (!existsSync(projectConfigDir(projectDir))) {
    printResult(
      {
        ok: false,
        error: `Not a valid bazel_git_lfs project: ${projectDir}. Run "bazel-git-lfs init" first.`,
      },
      { json: true },
    );
    return EXIT_ERROR;
  }

  if (!existsSync(new FsSnapshotStore().snapshotPath(projectDir))) {
    printResult(
      { ok: false, error: 'no dependency snapshot, run "bazel-git-lfs inspect" first' },
      { json: true },
    );
    return EXIT_ERROR;
  }

  let remote;
  try {
    const resolver = new ConfigResolver(new FsProfileStore());
    const effective = await resolver.resolveEffective({ cwd: projectDir, env: opts.env });
    remote = { alias: effective.alias, url: effective.profile.url };
  } catch (err) {
    if (err instanceof ConfigError) {
      printResult({ ok: false, error: err.message }, { json: true });
      return EXIT_ERROR;
    }
    printResult({ ok: false, error: (err as Error).message }, { json: true });
    return EXIT_ERROR;
  }

  let result;
  try {
    result = await runPull(projectDir, { remote });
  } catch (err) {
    if (err instanceof MissingSnapshotError) {
      printResult(
        { ok: false, error: 'no dependency snapshot, run "bazel-git-lfs inspect" first' },
        { json: true },
      );
      return EXIT_ERROR;
    }
    printResult({ ok: false, error: (err as Error).message }, { json: true });
    return EXIT_ERROR;
  }

  printResult(result, { json: true });
  return result.ok ? EXIT_OK : EXIT_ERROR;
}
