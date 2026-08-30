import { describe, expect, it, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProgram } from '@/cli/index';

interface Captured {
  code?: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd?: string): Promise<Captured> {
  const program = buildProgram(cwd ? { cwd } : {});
  const captured: Captured = { stdout: '', stderr: '' };

  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk: unknown): boolean => {
    captured.stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk: unknown): boolean => {
    captured.stderr += String(chunk);
    return true;
  };

  const originalExit = process.exitCode;
  try {
    program.parse(args);
    for (let i = 0; i < 400 && process.exitCode === originalExit; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    captured.code = process.exitCode;
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'commander.helpDisplayed' || e.code === 'commander.version') {
      captured.code = 0;
    } else {
      captured.code = 2;
    }
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
    process.exitCode = originalExit;
  }

  return captured;
}

function tempProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'bgl-checkout-'));
  const proj = join(root, 'proj');
  mkdirSync(proj, { recursive: true });
  return proj;
}

describe('checkout command end-to-end', () => {
  const projects: string[] = [];

  afterAll(() => {
    for (const p of projects) {
      rmSync(p, { recursive: true, force: true });
    }
  });

  it('reports not-initialized error when config area is missing', async () => {
    const proj = tempProject();
    projects.push(proj);
    const { code, stderr } = await runCli(['node', 'bazel-git-lfs', 'checkout', 'default'], proj);
    expect(code).toBe(1);
    expect(stderr).toContain('Not a valid bazel_git_lfs project');
  });

  it('rejects missing alias with usage error (exit 2)', async () => {
    const { code } = await runCli(['node', 'bazel-git-lfs', 'checkout']);
    expect(code).toBe(2);
  });

  it('reports error when mirror is not configured', async () => {
    const proj = tempProject();
    projects.push(proj);
    const bgl = join(proj, '.bazel_git_lfs');
    mkdirSync(bgl, { recursive: true });
    writeFileSync(join(bgl, 'config.json'), JSON.stringify({}));
    const { code, stderr } = await runCli(['node', 'bazel-git-lfs', 'checkout', 'default'], proj);
    expect(code).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });
});