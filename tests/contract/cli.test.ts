import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
    // command actions are async — wait for one to set the exit code
    for (let i = 0; i < 400 && process.exitCode === originalExit; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
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
  it('--help lists all commands', async () => {
    const { stdout } = await runCli(['node', 'bazel-git-lfs', '--help']);
    for (const cmd of ['init', 'inspect', 'fetch', 'pull', 'push', 'status', 'clean', 'checkout']) {
      expect(stdout).toContain(cmd);
    }
  });

  it('removed sync stub reports an unknown-command usage error (exit 2)', async () => {
    const { code } = await runCli(['node', 'bazel-git-lfs', 'sync']);
    expect(code).toBe(2);
  });

  it('fetch/pull/push reject extra arguments with a usage error (exit 2)', async () => {
    for (const cmd of ['fetch', 'pull', 'push']) {
      const { code } = await runCli(['node', 'bazel-git-lfs', cmd, 'extra-arg']);
      expect(code).toBe(2);
    }
  });

  it('fetch reports errors as JSON on stdout only (JSON-only contract)', async () => {
    const proj = tempProject();
    const { code, stdout, stderr } = await runCli(['node', 'bazel-git-lfs', 'fetch'], proj);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout); // stdout is the only channel; must be JSON
    expect(parsed).toEqual({
      ok: false,
      error: expect.stringContaining('Not a valid bazel_git_lfs project'),
    });
    expect(stderr).toBe('');
  });

  it('pull/push without a default profile report JSON errors (exit 1)', async () => {
    for (const cmd of ['pull', 'push']) {
      const proj = tempProject();
      await runCli(['node', 'bazel-git-lfs', 'init'], proj);
      writeFileSync(join(proj, '.bazel_git_lfs', 'dependencies.json'), JSON.stringify({
        projectDir: proj, dependencies: [], warnings: [], filesScanned: [],
        queryUsed: false, queryExternalRepos: null, dependencyRelations: null,
      }));
      const { code, stdout } = await runCli(['node', 'bazel-git-lfs', cmd], proj);
      expect(code).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/[Nn]o mirror configured/);
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it('init command is registered with help', async () => {
    const { stdout } = await runCli(['node', 'bazel-git-lfs', 'init', '--help']);
    expect(stdout).toContain('init');
  });

  it('init creates a config area via the CLI', async () => {
    const proj = tempProject();
    const { existsSync } = await import('node:fs');
    const { join: pathJoin } = await import('node:path');
    await runCli(['node', 'bazel-git-lfs', 'init'], proj);
    const target = pathJoin(proj, '.bazel_git_lfs');
    await vi.waitFor(() => {
      expect(existsSync(target)).toBe(true);
    });
    rmSync(proj, { recursive: true, force: true });
  });

  it('checkout rejects missing alias with usage error (exit 2)', async () => {
    const { code } = await runCli(['node', 'bazel-git-lfs', 'checkout']);
    expect(code).toBe(2);
  });

  it('checkout is registered with help', async () => {
    const { stdout } = await runCli(['node', 'bazel-git-lfs', 'checkout', '--help']);
    expect(stdout).toContain('checkout');
  });
});
