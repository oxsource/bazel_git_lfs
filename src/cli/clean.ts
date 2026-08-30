import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';

export interface CleanCliOptions {
  cwd: string;
}

export async function runCleanCommand(opts: CleanCliOptions): Promise<number> {
  const bglDir = join(opts.cwd, CONFIG_DIR_NAME);

  if (!existsSync(bglDir)) {
    format.printResult({ ok: false, error: `No .bazel_git_lfs directory found at ${bglDir}` }, { json: true });
    return EXIT_ERROR;
  }

  try {
    rmSync(bglDir, { recursive: true, force: true });
    format.printResult({ ok: true, command: 'clean', removed: bglDir }, { json: true });
    return EXIT_OK;
  } catch (err) {
    format.printResult({ ok: false, error: `Failed to remove ${bglDir}: ${(err as Error).message}` }, { json: true });
    return EXIT_ERROR;
  }
}