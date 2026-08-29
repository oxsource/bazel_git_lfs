import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsSnapshotStore } from '@/inspect/snapshot';
import { InspectResult } from '@/inspect/models';

function makeResult(projectDir: string): InspectResult {
  return {
    projectDir,
    dependencies: [
      {
        name: 'abseil',
        urls: ['https://github.com/abseil/abseil-cpp/archive/refs/tags/20250127.0.tar.gz'],
        sha256: '1111111111111111111111111111111111111111111111111111111111111111',
        stripPrefix: null,
        sourceFile: 'WORKSPACE',
        resolved: true,
      },
    ],
    warnings: [],
    filesScanned: ['WORKSPACE'],
    queryUsed: false,
    queryExternalRepos: null,
    dependencyRelations: null,
  };
}

describe('FsSnapshotStore', () => {
  it('writes and reads a snapshot under .bazel_git_lfs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bglf-snap-'));
    const projectDir = join(root, 'proj');
    mkdirSync(projectDir, { recursive: true });

    const store = new FsSnapshotStore();
    const result = makeResult(projectDir);
    const path = await store.write(projectDir, result);
    expect(path.endsWith(join('.bazel_git_lfs', 'dependencies.json'))).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('abseil');

    const read = await store.read(projectDir);
    expect(read.dependencies).toHaveLength(1);
    expect(read.dependencies[0].name).toBe('abseil');
  });

  it('returns an empty result when no snapshot exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bglf-snap-'));
    const projectDir = join(root, 'proj');
    mkdirSync(projectDir, { recursive: true });

    const store = new FsSnapshotStore();
    const read = await store.read(projectDir);
    expect(read.dependencies).toHaveLength(0);
  });
});
