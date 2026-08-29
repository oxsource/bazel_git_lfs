import { printResult, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runPush } from '@/transfer/push';
import { runPushPullCommand, type PushPullCliOptions } from '@/cli/push-pull';

/**
 * `push` command entry (JSON-only output, per contracts/cli.md).
 */
export async function runPushCommand(opts: PushPullCliOptions): Promise<number> {
  return runPushPullCommand(opts, async (projectDir, remote) => {
    const result = await runPush(projectDir, { remote });
    printResult(result, { json: true });
    return result.ok ? EXIT_OK : EXIT_ERROR;
  });
}
