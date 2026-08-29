import { projectConfigDir } from '@/config/paths';
import { inspectProject } from '@/inspect/inspector';
import { InspectResult } from '@/inspect/models';
import { FsSnapshotStore } from '@/inspect/snapshot';
import { printResult, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { existsSync } from 'node:fs';

export interface InspectOptions {
  cwd: string;
}

export async function runInspect(opts: InspectOptions): Promise<number> {
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

  let result: InspectResult;
  try {
    result = await inspectProject({ projectDir });
  } catch (err) {
    printResult({ ok: false, error: (err as Error).message }, { json: true });
    return EXIT_ERROR;
  }

  const store = new FsSnapshotStore();
  let snapshotPath: string;
  try {
    snapshotPath = await store.write(projectDir, result);
  } catch (err) {
    printResult(
      {
        ok: false,
        error: `Cannot write snapshot to ${store.snapshotPath(projectDir)}: ${(err as Error).message}`,
      },
      { json: true },
    );
    return EXIT_ERROR;
  }

  printResult(
    {
      ok: true,
      projectDir: result.projectDir,
      snapshotPath,
      dependencies: result.dependencies,
      warnings: result.warnings,
      filesScanned: result.filesScanned,
      queryUsed: result.queryUsed,
      queryExternalRepos: result.queryExternalRepos,
      dependencyRelations: result.dependencyRelations,
    },
    { json: true },
  );
  return EXIT_OK;
}
