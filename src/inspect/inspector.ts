import { stat } from 'node:fs/promises';
import { BazelLoader } from './loader';
import { runBazelQuery } from './bazel-query';
import { InspectResult, emptyInspectResult } from './models';

export interface InspectProjectOptions {
  projectDir: string;
  useQuery?: boolean;
}

export async function inspectProject(opts: InspectProjectOptions): Promise<InspectResult> {
  const result = emptyInspectResult(opts.projectDir);

  try {
    await stat(opts.projectDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Project directory not found: ${opts.projectDir}`);
    }
    throw new Error(`Project directory not readable: ${opts.projectDir}`);
  }

  const loader = new BazelLoader(opts.projectDir);
  const loaded = await loader.loadEntryFiles();

  result.dependencies = loaded.dependencies;
  result.warnings = loaded.warnings;
  result.filesScanned = loaded.filesScanned;

  if (opts.useQuery !== false) {
    const query = await runBazelQuery(opts.projectDir);
    if (query) {
      result.queryUsed = true;
      result.queryExternalRepos = query.externalRepos;
      result.dependencyRelations = query.dependencyRelations;
    } else {
      result.queryUsed = false;
      result.queryExternalRepos = null;
      result.dependencyRelations = null;
      result.warnings.push(
        'bazel query was not used: bazel binary unavailable or query failed; results are from file inspection only.',
      );
    }
  }

  return result;
}
