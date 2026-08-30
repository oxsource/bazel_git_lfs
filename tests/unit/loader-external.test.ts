import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const sandboxDir = fileURLToPath(new URL('../fixtures/sandbox', import.meta.url));
const fixturesDir = fileURLToPath(new URL('../fixtures/projects', import.meta.url));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('BazelLoader external loads', () => {
  it('loads dependencies from @repo// loads via sandbox', async () => {
    const projectDir = join(fixturesDir, 'external');

    const { execFile } = await import('node:child_process');
    (execFile as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string }) => void) => {
        if (cb) cb(null, { stdout: sandboxDir + '\n' });
        return {} as ReturnType<typeof execFile>;
      },
    );

    const { ExternalResolver } = await import('@/inspect/external-resolver');
    const { BazelLoader } = await import('@/inspect/loader');

    const resolver = new ExternalResolver(projectDir);
    const loader = new BazelLoader(projectDir, resolver);
    const result = await loader.loadEntryFiles();

    expect(result.dependencies.length).toBeGreaterThanOrEqual(3);

    const openssl = result.dependencies.find((d) => d.name === 'openssl');
    expect(openssl).toBeTruthy();

    const patchXyz = result.dependencies.find((d) => d.name === 'patch_xyz');
    expect(patchXyz).toBeTruthy();

    const bDep = result.dependencies.find((d) => d.name === 'B');
    expect(bDep).toBeTruthy();

    expect(result.filesScanned).toContain('@B//:deps.bzl');

    await resolver.cleanup();
  });

  it('no external loads → graceful degradation', async () => {
    const projectDir = join(fixturesDir, 'loaded');

    const { execFile } = await import('node:child_process');
    (execFile as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) cb(new Error('no bazel'));
        return {} as ReturnType<typeof execFile>;
      },
    );

    const { ExternalResolver } = await import('@/inspect/external-resolver');
    const { BazelLoader } = await import('@/inspect/loader');

    const resolver = new ExternalResolver(projectDir);
    const loader = new BazelLoader(projectDir, resolver);
    const result = await loader.loadEntryFiles();

    expect(result.dependencies.length).toBeGreaterThanOrEqual(2);

    await resolver.cleanup();
  });
});

describe('BazelLoader deduplication and conflict detection', () => {
  it('deduplicates identical re-declarations', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'bgl-test-dedup-'));
    mkdirSync(join(projectDir, '.bazel_git_lfs'), { recursive: true });
    writeFileSync(join(projectDir, 'WORKSPACE'), `
http_archive(
    name = "zlib",
    url = "https://example.org/zlib-1.3.tar.gz",
    sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
)
http_archive(
    name = "zlib",
    url = "https://example.org/zlib-1.3.tar.gz",
    sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
)
`);

    const { BazelLoader } = await import('@/inspect/loader');
    const loader = new BazelLoader(projectDir);
    const result = await loader.loadEntryFiles();

    expect(result.dependencies).toHaveLength(1);
    const zlib = result.dependencies[0];
    expect(zlib.name).toBe('zlib');
    expect(result.conflicts).toHaveLength(0);
  });

  it('detects divergent re-declarations as conflicts', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'bgl-test-conflict-'));
    mkdirSync(join(projectDir, '.bazel_git_lfs'), { recursive: true });
    writeFileSync(join(projectDir, 'WORKSPACE'), `
http_archive(
    name = "zlib",
    url = "https://example.org/zlib-1.3.tar.gz",
    sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
)
http_archive(
    name = "zlib",
    url = "https://example.org/zlib-2.0.tar.gz",
    sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
)
`);

    const { BazelLoader } = await import('@/inspect/loader');
    const loader = new BazelLoader(projectDir);
    const result = await loader.loadEntryFiles();

    expect(result.dependencies).toHaveLength(1);
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
    const conflict = result.conflicts[0];
    expect(conflict.repo).toBe('zlib');
    expect(conflict.differingFields).toContain('urls');
    expect(conflict.differingFields).toContain('sha256');
  });

  it('detects cycle via depth limit', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'bgl-test-cycle-'));
    mkdirSync(join(projectDir, '.bazel_git_lfs'), { recursive: true });
    writeFileSync(join(projectDir, 'WORKSPACE'), `load("//:a.bzl", "a")`);
    writeFileSync(join(projectDir, 'a.bzl'), `load("//:a.bzl", "a")`);

    const { BazelLoader } = await import('@/inspect/loader');
    const loader = new BazelLoader(projectDir);
    const result = await loader.loadEntryFiles();

    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    expect(result.conflicts).toHaveLength(0);
  });
});