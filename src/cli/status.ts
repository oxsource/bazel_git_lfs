import { checkInitialized } from '@/cli/common';
import { printResult, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runStatusScan } from '@/mirror/status';
import { GitLfsRepository } from '@/mirror/repository';
import { resolveDefaultRemote } from '@/cli/common';
import { sha256HexOfFile } from '@/objects/sha256';

export interface StatusCliOptions {
  cwd: string;
  sha256Prefix?: string;
  sourceUrl?: string;
  keyword?: string;
}

export async function runStatusCommand(opts: StatusCliOptions): Promise<number> {
  const projectDir = opts.cwd;

  const guard = checkInitialized(projectDir);
  if (!guard.ok) {
    printResult({ ok: false, error: guard.error }, { json: true });
    return EXIT_ERROR;
  }

  const remote = await resolveDefaultRemote(projectDir);
  if (!remote.ok) {
    printResult({ ok: false, error: remote.error }, { json: true });
    return EXIT_ERROR;
  }

  const repo = new GitLfsRepository(projectDir, remote.remote.url);
  try {
    await repo.ensureWorkingClone();
  } catch (err) {
    printResult({ ok: false, error: `cannot access mirror: ${(err as Error).message}` }, { json: true });
    return EXIT_ERROR;
  }

  const { manifest } = await repo.readManifest();

  const filters = opts.sha256Prefix || opts.sourceUrl || opts.keyword
    ? { sha256Prefix: opts.sha256Prefix, sourceUrl: opts.sourceUrl, keyword: opts.keyword }
    : undefined;

  const result = await runStatusScan(manifest, {
    materialize: async (relPaths: string[]) => repo.materialize(relPaths),
    sha256HexOfFile,
  }, filters);

  printResult(result, { json: true });
  return result.ok ? EXIT_OK : EXIT_ERROR;
}