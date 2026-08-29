import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runExternalDepCheckout } from '@/mirror/checkout';
import { ExternalResolver } from '@/inspect/external-resolver';
import { Dependency, DependencyConflict } from '@/inspect/models';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('runExternalDepCheckout', () => {
  it('generates patches and injects patch_cmds for external deps', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'bgl-checkout-patch-'));
    mkdirSync(join(projectDir, '.bazel_git_lfs', 'patches'), { recursive: true });
    mkdirSync(join(projectDir, '.bazel_git_lfs', 'mirror'), { recursive: true });

    // Create a mock sandbox + entry file.
    const sandboxDir = mkdtempSync(join(tmpdir(), 'bgl-test-sb-'));
    mkdirSync(join(sandboxDir, 'external', 'B'), { recursive: true });
    writeFileSync(join(sandboxDir, 'external', 'B', 'deps.bzl'), `
def setup_b():
    http_archive(
        name = "openssl",
        urls = ["https://example.org/openssl-1.1.1.tar.gz"],
        sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
`);

    const entryContent = `http_archive(
    name = "B",
    urls = ["https://example.org/B-1.0.tar.gz"],
    sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
)
load("@B//:deps.bzl", "setup_b")
setup_b()`;

    writeFileSync(join(projectDir, 'WORKSPACE'), entryContent);

    // Mock execFile to return sandbox as output_base.
    const { execFile } = await import('node:child_process');
    (execFile as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string }) => void) => {
        if (cb) cb(null, { stdout: sandboxDir + '\n' });
        return {} as ReturnType<typeof execFile>;
      },
    );

    // Create an empty manifest with the openssl entry.
    const manifest = { version: 1 as const, objects: {
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': {
        path: 'openssl/1.1.1/openssl-1.1.1.tar.gz',
        sources: ['https://example.org/openssl-1.1.1.tar.gz'],
      },
    } };

    const externalDeps: Dependency[] = [
      {
        name: 'openssl',
        urls: ['https://example.org/openssl-1.1.1.tar.gz'],
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        stripPrefix: null,
        sourceFile: '@B//:deps.bzl',
        resolved: true,
        origin: 'external-bzl',
        fromRepo: 'B',
        loadChain: ['@B//:deps.bzl'],
        alsoLoadedBy: [],
      },
    ];

    const entryFiles: Record<string, string> = { 'WORKSPACE': entryContent };
    let rewrittenEntry = entryContent;

    const { patches, skipped } = await runExternalDepCheckout(
      projectDir,
      'local',
      manifest,
      async (a) => {
        if (a === '@' || a === 'local') return { type: 'local', baseUrl: 'file:///fake' };
        return { type: 'original', baseUrl: '' };
      },
      entryFiles,
      async (filePath: string, content: string) => {
        if (filePath === 'WORKSPACE') rewrittenEntry = content;
      },
      externalDeps,
      new Set<string>(),
      { hasConflicts: false, conflicts: [] },
    );

    // Should have one patch for repo B.
    expect(patches.length).toBeGreaterThanOrEqual(1);
    expect(patches[0].repo).toBe('B');
    expect(patches[0].changes.length).toBeGreaterThanOrEqual(1);
    expect(patches[0].changes[0].dependency).toBe('openssl');

    // Entry file should contain the patch marker.
    expect(rewrittenEntry).toContain('bazel-git-lfs:checkout');

    // Audit patch file should exist.
    const { readFile, stat } = await import('node:fs/promises');
    const patchPath = join(projectDir, '.bazel_git_lfs', patches[0].patchFile);
    await expect(stat(patchPath)).resolves.toBeDefined();
    const patchContent = await readFile(patchPath, 'utf8');
    expect(patchContent).toContain('openssl');
  });
});