import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { BazelLoader } from '@/inspect/loader';

const fixturesDir = fileURLToPath(new URL('../fixtures/projects', import.meta.url));

describe('BazelLoader', () => {
  it('loads dependencies from WORKSPACE + loaded deps.bzl', async () => {
    const loader = new BazelLoader(`${fixturesDir}/loaded`);
    const result = await loader.loadEntryFiles();
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies.map((d) => d.name).sort()).toEqual(['cmake_patch', 'zlib']);
    expect(result.dependencies.every((d) => d.sourceFile.endsWith('deps.bzl'))).toBe(true);
    expect(result.filesScanned).toContain('WORKSPACE');
    expect(result.filesScanned.some((f) => f.includes('deps.bzl'))).toBe(true);
  });

  it('loads dependencies from WORKSPACE.bazel', async () => {
    const loader = new BazelLoader(`${fixturesDir}/workbench`);
    const result = await loader.loadEntryFiles();
    expect(result.dependencies).toHaveLength(0);
    expect(result.filesScanned).toContain('WORKSPACE.bazel');
  });

  it('loads dependencies from MODULE.bazel', async () => {
    const loader = new BazelLoader(`${fixturesDir}/module`);
    const result = await loader.loadEntryFiles();
    expect(result.dependencies).toHaveLength(2);
  });

  it('loads dependencies from a direct WORKSPACE', async () => {
    const loader = new BazelLoader(`${fixturesDir}/direct`);
    const result = await loader.loadEntryFiles();
    expect(result.dependencies).toHaveLength(3);
    expect(result.filesScanned).toContain('WORKSPACE');
  });
});
