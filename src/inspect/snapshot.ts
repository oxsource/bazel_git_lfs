import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { InspectResult, emptyInspectResult } from './models';

export const SNAPSHOT_FILE_NAME = 'dependencies.json';

export interface SnapshotStore {
  read(projectDir: string): Promise<InspectResult>;
  write(projectDir: string, result: InspectResult): Promise<string>;
}

export class FsSnapshotStore implements SnapshotStore {
  constructor(private readonly configDirName = '.bazel_git_lfs') {}

  snapshotPath(projectDir: string): string {
    return `${projectDir}/${this.configDirName}/${SNAPSHOT_FILE_NAME}`;
  }

  async read(projectDir: string): Promise<InspectResult> {
    try {
      const raw = await readFile(this.snapshotPath(projectDir), 'utf8');
      return JSON.parse(raw) as InspectResult;
    } catch {
      return emptyInspectResult(projectDir);
    }
  }

  async write(projectDir: string, result: InspectResult): Promise<string> {
    const path = this.snapshotPath(projectDir);
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });
    const tmpPath = `${path}.${process.pid}.tmp`;
    await writeFile(tmpPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    await rename(tmpPath, path);
    return path;
  }
}
