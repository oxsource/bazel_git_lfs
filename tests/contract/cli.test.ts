import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProgram } from '@/cli/index';
import { COMMANDS, FILES } from '@/config/constants';

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

const CUSTOM_COMMAND_NAMES = [COMMANDS.INIT, COMMANDS.INSPECT, COMMANDS.CLEAN, COMMANDS.CHECKOUT, COMMANDS.COMPLETION, COMMANDS.SKILL];

describe('CLI command surface', () => {
  it('--help lists all custom commands', async () => {
    const { stdout } = await runCli(['node', 'bazel-git-lfs', '--help']);
    for (const cmd of CUSTOM_COMMAND_NAMES) {
      expect(stdout).toContain(cmd);
    }
  });

  it('init command is registered with help', async () => {
    const { stdout } = await runCli(['node', 'bazel-git-lfs', COMMANDS.INIT, '--help']);
    expect(stdout).toContain(COMMANDS.INIT);
  });

  it('init creates a config area via the CLI', async () => {
    const proj = tempProject();
    await runCli(['node', 'bazel-git-lfs', COMMANDS.INIT], proj);
    const target = join(proj, '.bazel_git_lfs');
    await vi.waitFor(() => {
      expect(import('node:fs').then(({ existsSync }) => existsSync(target))).toBeTruthy();
    });
    rmSync(proj, { recursive: true, force: true });
  });

  it('init --with-bazelconfig writes a .bazelconfig template via the CLI', async () => {
    const proj = tempProject();
    const { code } = await runCli(['node', 'bazel-git-lfs', COMMANDS.INIT, '--with-bazelconfig'], proj);
    expect(code).toBe(0);
    const target = join(proj, '.bazel_git_lfs', FILES.BAZELCONFIG);
    await vi.waitFor(() => {
      expect(import('node:fs').then(({ existsSync }) => existsSync(target))).toBeTruthy();
    });
    const content = readFileSync(target, 'utf8');
    expect(content).toContain('[server]');
    expect(content).toContain('[inspect]');
    rmSync(proj, { recursive: true, force: true });
  });

  it('clean reports not-initialized error (exit 1) when no config area exists', async () => {
    const proj = tempProject();
    const { code, stdout } = await runCli(['node', 'bazel-git-lfs', COMMANDS.CLEAN], proj);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('No .bazel_git_lfs directory found');
    rmSync(proj, { recursive: true, force: true });
  });

  it('checkout rejects missing alias with usage error (exit 2)', async () => {
    const { code } = await runCli(['node', 'bazel-git-lfs', COMMANDS.CHECKOUT]);
    expect(code).toBe(2);
  });

  it('checkout is registered with help', async () => {
    const { stdout } = await runCli(['node', 'bazel-git-lfs', COMMANDS.CHECKOUT, '--help']);
    expect(stdout).toContain('checkout');
  });

  it('checkout in an uninitialized project exits with an error', async () => {
    const proj = tempProject();
    const { code, stderr } = await runCli(['node', 'bazel-git-lfs', COMMANDS.CHECKOUT, 'default'], proj);
    expect(code).toBe(1);
    expect(stderr).toContain('Not a valid bazel_git_lfs project');
    rmSync(proj, { recursive: true, force: true });
  });

  it('skill github.workflow writes release.yml via the CLI', async () => {
    const proj = tempProject();
    execFileSync('git', ['init', '-q'], { cwd: proj });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: proj });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: proj });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:oxsource/bazle_git_lfs.git'], {
      cwd: proj,
    });

    const { code } = await runCli(['node', 'bazel-git-lfs', COMMANDS.SKILL, 'github.workflow'], proj);

    expect(code).toBe(0);
    expect(existsSync(join(proj, '.github', 'workflows', 'release.yml'))).toBe(true);
    rmSync(proj, { recursive: true, force: true });
  });
});
