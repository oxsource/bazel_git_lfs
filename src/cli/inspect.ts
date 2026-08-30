import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { paths } from '@/config/paths';
import { inspectProject } from '@/inspect/inspector';
import { InspectResult } from '@/inspect/models';
import { FsSnapshotStore } from '@/inspect/snapshot';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { COMMANDS, TOOL_NAME } from '@/config/constants';

export interface InspectOptions {
  cwd: string;
  force?: boolean;
}

export async function runInspect(opts: InspectOptions): Promise<number> {
  const projectDir = opts.cwd;
  const configDir = paths.projectConfigDir(projectDir);

  if (!existsSync(configDir)) {
    format.printResult(
      {
        ok: false,
        error: `Not a valid bazel_git_lfs project: ${projectDir}. Run "${TOOL_NAME} ${COMMANDS.INIT}" first.`,
      },
      { json: true },
    );
    return EXIT_ERROR;
  }

  const store = new FsSnapshotStore();
  const snapshotPath = store.snapshotPath(projectDir);

  // If cache exists and not forced, print cached snapshot.
  if (!opts.force && existsSync(snapshotPath)) {
    try {
      const raw = await readFile(snapshotPath, 'utf8');
      process.stdout.write(raw);
      return EXIT_OK;
    } catch {
      // Cache read failed, fall through to re-scan.
    }
  }

  // Run fresh inspect.
  let result: InspectResult;
  try {
    result = await inspectProject({ projectDir });
  } catch (err) {
    format.printResult({ ok: false, error: (err as Error).message }, { json: true });
    return EXIT_ERROR;
  }

  try {
    await store.write(projectDir, result);
  } catch (err) {
    format.printResult(
      {
        ok: false,
        error: `Cannot write snapshot to ${snapshotPath}: ${(err as Error).message}`,
      },
      { json: true },
    );
    return EXIT_ERROR;
  }

  format.printResult(
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
      conflicts: result.conflicts,
      hasConflicts: result.hasConflicts,
    },
    { json: true },
  );

  return result.hasConflicts ? EXIT_ERROR : EXIT_OK;
}