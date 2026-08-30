import { stat } from 'node:fs/promises';
import { BazelLoader } from './loader';
import { ExternalResolver } from './external-resolver';
import { InspectResult, emptyInspectResult } from './models';

export interface InspectProjectOptions {
  projectDir: string;
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

  return result;
}