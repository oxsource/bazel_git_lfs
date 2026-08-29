import { describe, expect, it } from 'vitest';
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
});
