import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInspect } from '@/cli/inspect';

const fixturesDir = fileURLToPath(new URL('../fixtures/projects', import.meta.url));

function setupProject(fixture: string): string {
  const root = mkdtempSync(join(tmpdir(), 'bglf-inspect-config-'));
  const proj = join(root, 'proj');
  mkdirSync(proj, { recursive: true });
  cpSync(join(fixturesDir, fixture), proj, { recursive: true });
  mkdirSync(join(proj, '.bazel_git_lfs'), { recursive: true });
  return proj;
}

function writeBazelConfig(proj: string, content: string): void {
  writeFileSync(join(proj, '.bazel_git_lfs', '.bazelconfig'), content);
}

async function captureInspect(proj: string): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk: unknown): boolean => { stdout += String(chunk); return true; };
  process.stderr.write = (chunk: unknown): boolean => { stderr += String(chunk); return true; };
  try {
    const code = await runInspect({ cwd: proj });
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
}

describe('runInspect with .bazelconfig', () => {
  it('excludes configured dependency names from the snapshot', async () => {
    const proj = setupProject('direct');
    writeBazelConfig(proj, '[inspect]\nexclude = abseil\n');

    const { code } = await captureInspect(proj);
    expect(code).toBe(0);

    const snapshot = JSON.parse(readFileSync(join(proj, '.bazel_git_lfs', 'dependencies.json'), 'utf8'));
    const names = snapshot.dependencies.map((d: { name: string }) => d.name).sort();
    expect(names).not.toContain('abseil');
    expect(names).toContain('googletest_patch');
    expect(names).toContain('protobuf');
  });

  it('appends a manual dependency (missed by the scan) to the snapshot', async () => {
    const proj = setupProject('empty');
    writeBazelConfig(
      proj,
      '[inspect]\nappend = manual_dep|https://example.org/m.tar.gz|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n',
    );

    const { code, stderr } = await captureInspect(proj);
    expect(code).toBe(0);
    expect(stderr).toContain('appended manual dependency "manual_dep"');

    const snapshot = JSON.parse(readFileSync(join(proj, '.bazel_git_lfs', 'dependencies.json'), 'utf8'));
    const manual = snapshot.dependencies.find((d: { name: string }) => d.name === 'manual_dep');
    expect(manual).toBeDefined();
    expect(manual.urls).toEqual(['https://example.org/m.tar.gz']);
    expect(manual.sourceFile).toBe('manual');
  });

  it('applies config consistently on a cached snapshot', async () => {
    const proj = setupProject('direct');
    // First scan without config.
    await captureInspect(proj);
    // Then add config and re-run (cached snapshot branch).
    writeBazelConfig(proj, '[inspect]\nexclude = abseil\n');
    const { code } = await captureInspect(proj);
    expect(code).toBe(0);

    const snapshot = JSON.parse(readFileSync(join(proj, '.bazel_git_lfs', 'dependencies.json'), 'utf8'));
    const names = snapshot.dependencies.map((d: { name: string }) => d.name);
    expect(names).not.toContain('abseil');
  });
});
