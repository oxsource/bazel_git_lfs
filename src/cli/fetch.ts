import { guard } from '@/cli/common';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
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

  for (const g of [guard.checkInitialized(projectDir), guard.checkSnapshot(projectDir)]) {
    if (!g.ok) {
      format.printResult({ ok: false, error: g.error }, { json: true });
      return EXIT_ERROR;
    }
  }

  const result = await runFetch(projectDir);
  format.printResult(result, { json: true });
  return result.ok ? EXIT_OK : EXIT_ERROR;
}
