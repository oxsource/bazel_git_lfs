import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runPull } from '@/transfer/pull';
import { runPushPullCommand, type PushPullCliOptions } from '@/cli/push-pull';

/**
 * `pull` command entry (JSON-only output, per contracts/cli.md).
 */
export async function runPullCommand(opts: PushPullCliOptions): Promise<number> {
  return runPushPullCommand(opts, async (projectDir, remote) => {
    const result = await runPull(projectDir, { remote });
    format.printResult(result, { json: true });
    return result.ok ? EXIT_OK : EXIT_ERROR;
  });
}
