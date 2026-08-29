import { existsSync } from 'node:fs';
import { projectConfigDir } from '@/config/paths';
import { FsSnapshotStore } from '@/inspect/snapshot';
import { printResult, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runFetch, MissingSnapshotError } from '@/transfer/fetch';

export interface FetchCliOptions {
  cwd: string;
}

/**
 * `fetch` command entry (JSON-only output, per contracts/cli.md):
 * init-check → snapshot-check → orchestrate → per-dependency statuses.
 */
export async function runFetchCommand(opts: FetchCliOptions): Promise<number> {
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

  let result;
  try {
    result = await runFetch(projectDir);
  } catch (err) {
    if (err instanceof MissingSnapshotError) {
      printResult({ ok: false, error: 'no dependency snapshot, run "bazel-git-lfs inspect" first' }, { json: true });
      return EXIT_ERROR;
    }
    printResult({ ok: false, error: (err as Error).message }, { json: true });
    return EXIT_ERROR;
  }

  printResult(result, { json: true });
  return result.ok ? EXIT_OK : EXIT_ERROR;
}
