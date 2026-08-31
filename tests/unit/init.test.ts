import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '@/cli/init';
import { FILES } from '@/config/constants';

function tempProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'bazel-git-lfs-init-'));
  const proj = join(root, 'proj');
  mkdirSync(proj, { recursive: true });
  return proj;
}

async function quietInit(cwd: string, json = false, withBazelconfig = false): Promise<number> {
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    return await runInit({ cwd, json, withBazelconfig });
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
}

const configFile = (proj: string): string => join(proj, '.bazel_git_lfs', FILES.BAZELCONFIG);

describe('runInit', () => {
  it('creates a .bazel_git_lfs config directory', async () => {
    const proj = tempProject();
    const code = await quietInit(proj);
    expect(code).toBe(0);
    expect(existsSync(join(proj, '.bazel_git_lfs'))).toBe(true);
  });

  it('is safe to re-run', async () => {
    const proj = tempProject();
    await quietInit(proj);
    const code = await quietInit(proj);
    expect(code).toBe(0);
    expect(existsSync(join(proj, '.bazel_git_lfs'))).toBe(true);
  });

  it('adds .bazel_git_lfs to .gitignore when a git repo is present', async () => {
    const proj = tempProject();
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['init', '-q'], { cwd: proj });
    await quietInit(proj);
    const content = readFileSync(join(proj, '.gitignore'), 'utf8');
    expect(content).toContain('.bazel_git_lfs/*');
    expect(content).toContain('!.bazel_git_lfs/.bazelconfig');
  });

  it('creates .gitignore when absent in a git repo', async () => {
    const proj = tempProject();
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['init', '-q'], { cwd: proj });
    await quietInit(proj);
    expect(existsSync(join(proj, '.gitignore'))).toBe(true);
  });

  it('does not touch .gitignore when not a git repo', async () => {
    const proj = tempProject();
    await quietInit(proj);
    expect(existsSync(join(proj, '.gitignore'))).toBe(false);
  });

  it('returns a clean exit and leaves temp dirs alone', async () => {
    const proj = tempProject();
    const code = await quietInit(proj, true);
    expect(code).toBe(0);
    rmSync(join(proj), { recursive: true, force: true });
  });

  it('writes a .bazelconfig template with --with-bazelconfig', async () => {
    const proj = tempProject();
    const code = await quietInit(proj, false, true);
    expect(code).toBe(0);
    expect(existsSync(configFile(proj))).toBe(true);
    const content = readFileSync(configFile(proj), 'utf8');
    expect(content).toContain('[server]');
    expect(content).toContain('[inspect]');
  });

  it('does not create .bazelconfig without --with-bazelconfig', async () => {
    const proj = tempProject();
    await quietInit(proj);
    expect(existsSync(configFile(proj))).toBe(false);
  });

  it('preserves an existing .bazelconfig when --with-bazelconfig is used', async () => {
    const proj = tempProject();
    mkdirSync(join(proj, '.bazel_git_lfs'), { recursive: true });
    writeFileSync(configFile(proj), '[server]\nport = 9999\n');
    const code = await quietInit(proj, false, true);
    expect(code).toBe(0);
    const content = readFileSync(configFile(proj), 'utf8');
    expect(content).toContain('port = 9999');
    expect(content).not.toContain('[inspect]');
  });

  it('is safe to re-run with --with-bazelconfig', async () => {
    const proj = tempProject();
    await quietInit(proj, false, true);
    const code = await quietInit(proj, false, true);
    expect(code).toBe(0);
    expect(existsSync(configFile(proj))).toBe(true);
  });
});
