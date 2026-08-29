import { checkInitialized, checkSnapshot } from '@/cli/common';
import { printResult, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runFetch } from '@/transfer/fetch';

export interface FetchCliOptions {
  cwd: string;
}

/**
 * `fetch` command entry (JSON-only output, per contracts/cli.md):
 * init-check → snapshot-check → orchestrate. No mirror profile needed.
 */
export async function runFetchCommand(opts: FetchCliOptions): Promise<number> {
  const projectDir = opts.cwd;

  for (const guard of [checkInitialized(projectDir), checkSnapshot(projectDir)]) {
    if (!guard.ok) {
      printResult({ ok: false, error: guard.error }, { json: true });
      return EXIT_ERROR;
    }
  }

  const result = await runFetch(projectDir);
  printResult(result, { json: true });
  return result.ok ? EXIT_OK : EXIT_ERROR;
}
