import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProgram } from '@/cli/index';

interface Captured {
  code?: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd?: string): Captured {
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
    captured.code = process.exitCode;
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'commander.helpDisplayed' || e.code === 'commander.version') {
      captured.code = 0;
    } else {
      // Mirrors run() in src/cli/index.ts: any commander usage error is
      // reported as a usage error with exit code 2.
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
  const root = mkdtempSync(join(tmpdir(), 'bazel-git-lfs-cli-'));
  const proj = join(root, 'proj');
  mkdirSync(proj, { recursive: true });
  return proj;
}

describe('CLI command surface', () => {
  it('--help lists all commands (sync superseded by fetch/pull/push)', () => {
    const { stdout } = runCli(['node', 'bazel-git-lfs', '--help']);
    for (const cmd of ['init', 'inspect', 'fetch', 'pull', 'push', 'verify', 'list', 'search', 'rewrite']) {
      expect(stdout).toContain(cmd);
    }
    expect(stdout).not.toMatch(/\bsync\b/);
  });

  it('stub commands exit non-zero', () => {
    for (const cmd of ['verify', 'list', 'search', 'rewrite']) {
      const { code, stderr } = runCli(['node', 'bazel-git-lfs', cmd]);
      expect(code).toBe(1);
      expect(stderr).toContain('not implemented');
    }
  });

  it('stub commands emit JSON error with --json', () => {
    const { stdout } = runCli(['node', 'bazel-git-lfs', 'verify', '--json']);
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({ ok: false, error: expect.stringContaining('not implemented') });
  });

  it('removed sync stub reports an unknown-command usage error (exit 2)', () => {
    const { code } = runCli(['node', 'bazel-git-lfs', 'sync']);
    expect(code).toBe(2);
  });

  it('fetch/pull/push reject extra arguments with a usage error (exit 2)', () => {
    for (const cmd of ['fetch', 'pull', 'push']) {
      const { code } = runCli(['node', 'bazel-git-lfs', cmd, 'extra-arg']);
      expect(code).toBe(2);
    }
  });

  it('init command is registered with help', () => {
    const { stdout } = runCli(['node', 'bazel-git-lfs', 'init', '--help']);
    expect(stdout).toContain('init');
  });

  it('init creates a config area via the CLI', async () => {
    const proj = tempProject();
    const { existsSync } = await import('node:fs');
    const { join: pathJoin } = await import('node:path');
    runCli(['node', 'bazel-git-lfs', 'init'], proj);
    const target = pathJoin(proj, '.bazel_git_lfs');
    await vi.waitFor(() => {
      expect(existsSync(target)).toBe(true);
    });
    rmSync(proj, { recursive: true, force: true });
  });
});
