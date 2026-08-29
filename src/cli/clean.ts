import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { checkInitialized } from '@/cli/common';
import { printResult, EXIT_OK, EXIT_ERROR } from '@/cli/format';

export interface CleanCliOptions {
  cwd: string;
}

export interface CleanResult {
  ok: boolean;
  command: 'clean';
  removed: {
    objects: boolean;
    mirror: boolean;
    snapshot: boolean;
  };
}

export async function runClean(projectDir: string): Promise<CleanResult> {
  const bglDir = join(projectDir, CONFIG_DIR_NAME);
  const removed = { objects: false, mirror: false, snapshot: false };

  const objectsDir = join(bglDir, 'objects');
  if (existsSync(objectsDir)) {
    rmSync(objectsDir, { recursive: true, force: true });
    removed.objects = true;
  }

  const mirrorDir = join(bglDir, 'mirror');
  if (existsSync(mirrorDir)) {
    rmSync(mirrorDir, { recursive: true, force: true });
    removed.mirror = true;
  }

  const snapshotPath = join(bglDir, 'dependencies.json');
  if (existsSync(snapshotPath)) {
    rmSync(snapshotPath, { force: true });
    removed.snapshot = true;
  }

  return { ok: true, command: 'clean', removed };
}

export async function runCleanCommand(opts: CleanCliOptions): Promise<number> {
  const projectDir = opts.cwd;

  const guard = checkInitialized(projectDir);
  if (!guard.ok) {
    printResult({ ok: false, error: guard.error }, { json: true });
    return EXIT_ERROR;
  }

  const result = await runClean(projectDir);
  printResult(result, { json: true });
  return EXIT_OK;
}