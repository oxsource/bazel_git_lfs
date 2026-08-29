import { describe, expect, it, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runClean } from '@/cli/clean';

describe('clean file removal', () => {
  const projects: string[] = [];

  afterAll(() => {
    for (const p of projects) {
      rmSync(p, { recursive: true, force: true });
    }
  });

  function makeProject(): string {
    const root = mkdtempSync(join(tmpdir(), 'bgl-clean-'));
    const proj = join(root, 'proj');
    mkdirSync(proj, { recursive: true });
    projects.push(proj);
    return proj;
  }

  function initProject(proj: string): void {
    const bgl = join(proj, '.bazel_git_lfs');
    mkdirSync(join(bgl, 'objects'), { recursive: true });
    mkdirSync(join(bgl, 'mirror'), { recursive: true });
    writeFileSync(join(bgl, 'config.json'), JSON.stringify({ alias: 'default', url: 'file:///tmp/mirror' }));
    writeFileSync(join(bgl, 'dependencies.json'), JSON.stringify({ projectDir: proj, dependencies: [] }));
    writeFileSync(join(proj, '.gitignore'), '.bazel_git_lfs/\n');
  }

  it('removes objects, mirror, and snapshot while preserving config', async () => {
    const proj = makeProject();
    initProject(proj);

    const result = await runClean(proj);

    expect(result.ok).toBe(true);
    expect(result.removed.objects).toBe(true);
    expect(result.removed.mirror).toBe(true);
    expect(result.removed.snapshot).toBe(true);

    const bgl = join(proj, '.bazel_git_lfs');
    expect(existsSync(join(bgl, 'objects'))).toBe(false);
    expect(existsSync(join(bgl, 'mirror'))).toBe(false);
    expect(existsSync(join(bgl, 'dependencies.json'))).toBe(false);
    expect(existsSync(join(bgl, 'config.json'))).toBe(true);
  });

  it('is idempotent on an already clean project', async () => {
    const proj = makeProject();
    initProject(proj);

    await runClean(proj);
    const result = await runClean(proj);

    expect(result.ok).toBe(true);
    expect(result.removed.objects).toBe(false);
    expect(result.removed.mirror).toBe(false);
    expect(result.removed.snapshot).toBe(false);
  });

  it('preserves .gitignore entry', async () => {
    const proj = makeProject();
    initProject(proj);

    await runClean(proj);

    const gitignore = join(proj, '.gitignore');
    expect(existsSync(gitignore)).toBe(true);
  });
});