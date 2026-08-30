import { stat } from 'node:fs/promises';
import { BazelLoader } from './loader';
import { ExternalResolver } from './external-resolver';
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

  const log = (msg: string) => process.stderr.write(`[inspect] ${msg}\n`);

  log('Starting dependency scan...');

  const resolver = new ExternalResolver(opts.projectDir);
  const loader = new BazelLoader(opts.projectDir, resolver, log);
  let loaded;
  try {
    loaded = await loader.loadEntryFiles();
  } finally {
    await resolver.cleanup().catch(() => {});
  }

  log(`Scanned ${loaded.filesScanned.length} file(s), found ${loaded.dependencies.length} dependency(ies)`);

  result.dependencies = loaded.dependencies;
  result.warnings = loaded.warnings;
  result.filesScanned = loaded.filesScanned;
  result.conflicts = loaded.conflicts;
  result.hasConflicts = loaded.conflicts.length > 0;

  if (opts.useQuery !== false) {
    log('Running bazel query...');
    const query = await runBazelQuery(opts.projectDir);
    if (query) {
      result.queryUsed = true;
      result.queryExternalRepos = query.externalRepos;
      result.dependencyRelations = query.dependencyRelations;
      log('bazel query completed');
    } else {
      result.queryUsed = false;
      result.queryExternalRepos = null;
      result.dependencyRelations = null;
      result.warnings.push(
        'bazel query was not used: bazel binary unavailable or query failed; results are from file inspection only.',
      );
      log('bazel query unavailable or failed');
    }
  }

  return result;
}