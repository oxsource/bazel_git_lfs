import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { guard } from '@/cli/common';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { COMMANDS, DIRS } from '@/config/constants';

export interface CleanCliOptions {
  cwd: string;
}

export interface CleanResult {
  ok: boolean;
  command: typeof COMMANDS.CLEAN;
  removed: {
    objects: boolean;
    mirror: boolean;
    snapshot: boolean;
  };
}

export async function runClean(projectDir: string): Promise<CleanResult> {
  const bglDir = join(projectDir, CONFIG_DIR_NAME);
  const removed = { objects: false, mirror: false, snapshot: false };

  const objectsDir = join(bglDir, DIRS.OBJECTS);
  if (existsSync(objectsDir)) {
    rmSync(objectsDir, { recursive: true, force: true });
    removed.objects = true;
  }

  const mirrorDir = join(bglDir, DIRS.MIRROR);
  if (existsSync(mirrorDir)) {
    rmSync(mirrorDir, { recursive: true, force: true });
    removed.mirror = true;
  }

  const snapshotPath = join(bglDir, 'dependencies.json');
  if (existsSync(snapshotPath)) {
    rmSync(snapshotPath, { force: true });
    removed.snapshot = true;
  }

  return { ok: true, command: COMMANDS.CLEAN, removed };
}

export async function runCleanCommand(opts: CleanCliOptions): Promise<number> {
  const projectDir = opts.cwd;

  const g = guard.checkInitialized(projectDir);
  if (!g.ok) {
    format.printResult({ ok: false, error: g.error }, { json: true });
    return EXIT_ERROR;
  }

  const result = await runClean(projectDir);
  format.printResult(result, { json: true });
  return EXIT_OK;
}