import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { guard } from '@/cli/common';

export interface CleanCliOptions {
  cwd: string;
}

export async function runCleanCommand(opts: CleanCliOptions): Promise<number> {
  const projectDir = guard.findProjectRoot(opts.cwd);
  if (!projectDir) {
    format.printResult({ ok: false, error: `No .bazel_git_lfs directory found` }, { json: true });
    return EXIT_ERROR;
  }

  const bglDir = join(projectDir, CONFIG_DIR_NAME);

  try {
    rmSync(bglDir, { recursive: true, force: true });
    format.printResult({ ok: true, command: 'clean', removed: bglDir }, { json: true });
    return EXIT_OK;
  } catch (err) {
    format.printResult({ ok: false, error: `Failed to remove ${bglDir}: ${(err as Error).message}` }, { json: true });
    return EXIT_ERROR;
  }
}