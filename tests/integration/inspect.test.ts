import { describe, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInspect } from '@/cli/inspect';

const fixturesDir = fileURLToPath(new URL('../fixtures/projects', import.meta.url));
const sandboxDir = fileURLToPath(new URL('../fixtures/sandbox', import.meta.url));

function setupProject(fixture: string): string {
  const root = mkdtempSync(join(tmpdir(), 'bglf-inspect-'));
  const proj = join(root, 'proj');
  mkdirSync(proj, { recursive: true });
  cpSync(join(fixturesDir, fixture), proj, { recursive: true });
  mkdirSync(join(proj, '.bazel_git_lfs'), { recursive: true });
  return proj;
}

async function captureInspect(proj: string): Promise<{ code: number; stdout: string }> {
  let stdout = '';
  const originalOut = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown): boolean => {
    stdout += String(chunk);
    return true;
  };
  try {
    const code = await runInspect({ cwd: proj });
    return { code, stdout };
  } finally {
    process.stdout.write = originalOut;
  }
}

describe('runInspect', () => {
  it('errors as JSON when the project is not initialized', async () => {
    const proj = setupProject('direct');
    rmSync(join(proj, '.bazel_git_lfs'), { recursive: true });

    const { code, stdout } = await captureInspect(proj);

    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('Not a valid bazel_git_lfs project');
    expect(parsed.error).toContain('init');
  });

  it('discovers direct http_archive deps', async () => {
    const proj = setupProject('direct');
    const { code, stdout } = await captureInspect(proj);

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.dependencies).toHaveLength(3);
    expect(parsed.dependencies.map((d: { name: string }) => d.name).sort()).toEqual([
      'abseil',
      'googletest_patch',
      'protobuf',
    ]);
  });

  it('discovers deps from a loaded .bzl file', async () => {
    const proj = setupProject('loaded');
    const { code, stdout } = await captureInspect(proj);

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.filesScanned).toContain('deps.bzl');
  });

  it('reports an empty dependency set for an empty project', async () => {
    const proj = setupProject('empty');
    const { code, stdout } = await captureInspect(proj);

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.dependencies).toHaveLength(0);
  });

  it('persists the snapshot with the discovered dependencies', async () => {
    const proj = setupProject('direct');
    const { code, stdout } = await captureInspect(proj);

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.snapshotPath).toBe(join(proj, '.bazel_git_lfs', 'dependencies.json'));

    const snapshot = JSON.parse(readFileSync(parsed.snapshotPath, 'utf8'));
    expect(snapshot.dependencies.map((d: { name: string }) => d.name).sort()).toEqual([
      'abseil',
      'googletest_patch',
      'protobuf',
    ]);
  });

  it('recreates a deleted snapshot (idempotent overwrite)', async () => {
    const proj = setupProject('loaded');
    const snapshotPath = join(proj, '.bazel_git_lfs', 'dependencies.json');

    const first = await captureInspect(proj);
    expect(first.code).toBe(0);
    expect(existsSync(snapshotPath)).toBe(true);

    rmSync(snapshotPath);
    const second = await captureInspect(proj);
    expect(second.code).toBe(0);
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    expect(snapshot.dependencies.length).toBeGreaterThan(0);
  });

  it('returns a JSON error naming the file for an unparsable Bazel file', async () => {
    const proj = setupProject('direct');
    writeFileSync(join(proj, 'WORKSPACE'), 'http_archive(\n  name = "broken",\n');

    const { code, stdout } = await captureInspect(proj);

    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('Cannot parse Bazel file: WORKSPACE');
  });

  it('returns a JSON error for an unreadable Bazel file', async () => {
    const proj = setupProject('direct');
    chmodSync(join(proj, 'WORKSPACE'), 0o000);

    const { code, stdout } = await captureInspect(proj);
    chmodSync(join(proj, 'WORKSPACE'), 0o644);

    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('Cannot read Bazel file: WORKSPACE');
  });

  it('discovers external deps from @repo// loads via sandbox', async () => {
    const proj = setupProject('external');

    // Mock execFile to return the sandbox dir as the output_base.
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string }) => void) => {
          if (cb) cb(null, { stdout: sandboxDir + '\n' });
          return {} as ReturnType<typeof import('node:child_process').execFile>;
        },
      ),
    }));

    // Re-import to pick up the mock.
    const { runInspect: ri } = await import('@/cli/inspect');
    const { code, stdout } = await captureInspect(proj);

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);

    // Should find B (entry) + openssl + patch_xyz (from B's bzl).
    expect(parsed.dependencies.length).toBeGreaterThanOrEqual(3);

    const openssl = parsed.dependencies.find((d: { name: string }) => d.name === 'openssl');
    expect(openssl).toBeTruthy();
    expect(openssl.origin).toBe('external-bzl');
    expect(openssl.fromRepo).toBe('B');
    expect(openssl.loadChain).toContain('@B//:deps.bzl');

    const bDep = parsed.dependencies.find((d: { name: string }) => d.name === 'B');
    expect(bDep).toBeTruthy();
    expect(bDep.origin).toBe('entry');

    // Confirm snapshot was written with schema version.
    const snapshot = JSON.parse(readFileSync(parsed.snapshotPath, 'utf8'));
    expect(snapshot.schemaVersion).toBe(2);
  });

  it('detects conflicting re-declarations and exits non-zero', async () => {
    const proj = setupProject('empty');
    // Overwrite WORKSPACE with conflicting declarations.
    writeFileSync(join(proj, 'WORKSPACE'), `
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

    const { code, stdout } = await captureInspect(proj);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.conflicts).toHaveLength(1);
    expect(parsed.conflicts[0].repo).toBe('zlib');
    expect(parsed.hasConflicts).toBe(true);
  });

  it('detects load cycles gracefully', async () => {
    const proj = setupProject('empty');
    // Create a self-referencing load cycle.
    writeFileSync(join(proj, 'WORKSPACE'), 'load("//:a.bzl", "a")');
    writeFileSync(join(proj, 'a.bzl'), 'load("//:a.bzl", "a")');

    const { code, stdout } = await captureInspect(proj);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    // Should not crash; cycle is caught by visited set.
    expect(parsed.conflicts).toHaveLength(0);
  });
});
