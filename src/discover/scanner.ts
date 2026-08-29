import { stat } from 'node:fs/promises';
import { BazelLoader } from './loader';
import { runBazelQuery } from './bazel-query';
import { ScanResult, emptyScanResult } from './models';

export interface ScanOptions {
  projectDir: string;
  useQuery?: boolean;
}

export async function scanProject(opts: ScanOptions): Promise<ScanResult> {
  const result = emptyScanResult(opts.projectDir);

  const dirExists = await pathExists(opts.projectDir);
  if (!dirExists) {
    throw new Error(`Project directory not found: ${opts.projectDir}`);
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
        'bazel query was not used: bazel binary unavailable or query failed; results are from file scanning only.',
      );
    }
  }

  return result;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
