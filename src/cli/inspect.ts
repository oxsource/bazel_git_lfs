import { projectConfigDir } from '@/config/paths';
import { scanProject } from '@/discover/scanner';
import { ScanResult } from '@/discover/models';
import { printResult, printError, OutputOptions, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { existsSync } from 'node:fs';

export interface InspectOptions extends OutputOptions {
  cwd: string;
  projectDir?: string;
}

export async function runInspect(opts: InspectOptions): Promise<number> {
  const projectDir = opts.projectDir ?? opts.cwd;

  if (!existsSync(projectConfigDir(projectDir))) {
    printError(`No config area found in ${projectDir}. Run "bazel-git-lfs init" first.`, opts);
    return EXIT_ERROR;
  }

  let result: ScanResult;
  try {
    result = await scanProject({ projectDir });
  } catch (err) {
    printError((err as Error).message, opts);
    return EXIT_ERROR;
  }

  if (opts.json) {
    printResult(
      {
        ok: true,
        projectDir: result.projectDir,
        dependencies: result.dependencies,
        warnings: result.warnings,
        filesScanned: result.filesScanned,
        queryUsed: result.queryUsed,
        queryExternalRepos: result.queryExternalRepos,
        dependencyRelations: result.dependencyRelations,
      },
      opts,
    );
    return EXIT_OK;
  }

  renderHuman(result);
  return EXIT_OK;
}

function renderHuman(result: ScanResult): void {
  for (const dep of result.dependencies) {
    process.stdout.write(
      `  ${dep.name}  sha256=${dep.sha256 ?? '-'}  ${dep.sourceFile}  ${dep.urls[0]}\n`,
    );
  }
  if (result.dependencies.length === 0) {
    process.stdout.write('No HTTP dependencies found.\n');
  } else {
    process.stdout.write(
      `Found ${result.dependencies.length} HTTP dependenc${result.dependencies.length === 1 ? 'y' : 'ies'}.\n`,
    );
  }
  for (const warning of result.warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
}
