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
  const root = mkdtempSync(join(tmpdir(), 'bgl-status-'));
  const proj = join(root, 'proj');
  mkdirSync(proj, { recursive: true });
  return proj;
}

describe('status command end-to-end', () => {
  const projects: string[] = [];

  afterAll(() => {
    for (const p of projects) {
      rmSync(p, { recursive: true, force: true });
    }
  });

  it('reports not-initialized error when config area is missing', async () => {
    const proj = tempProject();
    projects.push(proj);
    const { code, stdout } = await runCli(['node', 'bazel-git-lfs', 'status'], proj);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('Not a valid bazel_git_lfs project');
  });

  it('rejects extra arguments with a usage error (exit 2)', async () => {
    const { code } = await runCli(['node', 'bazel-git-lfs', 'status', 'kw', 'extra']);
    expect(code).toBe(2);
  });
});