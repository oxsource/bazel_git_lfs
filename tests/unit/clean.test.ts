import { describe, expect, it, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCleanCommand } from '@/cli/clean';
import { EXIT_OK, EXIT_ERROR } from '@/cli/format';

describe('clean command', () => {
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
    writeFileSync(join(bgl, 'config.json'), JSON.stringify({ alias: 'default', url: 'file:///tmp/mirror' }));
    writeFileSync(join(bgl, 'dependencies.json'), JSON.stringify({ projectDir: proj, dependencies: [] }));
    writeFileSync(join(proj, '.gitignore'), '.bazel_git_lfs/\n');
  }

  it('removes the entire config area', async () => {
    const proj = makeProject();
    initProject(proj);

    const code = await runCleanCommand({ cwd: proj });

    expect(code).toBe(EXIT_OK);
    const bgl = join(proj, '.bazel_git_lfs');
    expect(existsSync(bgl)).toBe(false);
  });

  it('reports not-initialized when the config area is missing', async () => {
    const proj = makeProject();

    const code = await runCleanCommand({ cwd: proj });

    expect(code).toBe(EXIT_ERROR);
  });

  it('preserves .gitignore entry', async () => {
    const proj = makeProject();
    initProject(proj);

    await runCleanCommand({ cwd: proj });

    const gitignore = join(proj, '.gitignore');
    expect(existsSync(gitignore)).toBe(true);
  });
});
