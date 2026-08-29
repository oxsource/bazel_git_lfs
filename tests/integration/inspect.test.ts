import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
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

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
}

describe('runInspect', () => {
  it('errors when the project is not initialized', async () => {
    const proj = setupProject('direct');
    rmSync(join(proj, '.bazel_git_lfs'), { recursive: true });

    let stdout = '';
    const originalOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    };
    const code = await runInspect({ cwd: proj, json: true });
    process.stdout.write = originalOut;

    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('init');
  });

  it('discovers direct http_archive deps', async () => {
    const proj = setupProject('direct');
    let stdout = '';
    const originalOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    };
    const code = await runInspect({ cwd: proj, json: true });
    process.stdout.write = originalOut;

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.dependencies).toHaveLength(3);
    expect(parsed.dependencies.map((d: { name: string }) => d.name).sort()).toEqual([
      'abseil',
      'googletest_patch',
      'protobuf',
    ]);
  });

  it('discovers deps from a loaded .bzl file', async () => {
    const proj = setupProject('loaded');
    const code = await quiet(() => runInspect({ cwd: proj, json: true }));
    expect(code).toBe(0);
  });

  it('reports an empty result for an empty project (human)', async () => {
    const proj = setupProject('empty');
    let stdout = '';
    const originalOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    };
    const code = await runInspect({ cwd: proj });
    process.stdout.write = originalOut;

    expect(code).toBe(0);
    expect(stdout).toContain('No HTTP dependencies found.');
  });

  it('returns an error for a missing project directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bglf-inspect-'));
    const missing = join(root, 'nope');
    const code = await quiet(() => runInspect({ cwd: root, projectDir: missing, json: true }));
    expect(code).toBe(1);
  });
});
