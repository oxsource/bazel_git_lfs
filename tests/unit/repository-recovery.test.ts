import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitLfsRepository } from '@/mirror/repository';

const cleanups: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

/** A plain (non-LFS) remote with one commit, for recovery-path testing. */
function makeBareWithSeed(): string {
  const base = tempDir('bgl-repo-');
  const bare = join(base, 'mirror.git');
  const seed = join(base, 'seed');
  execFileSync('git', ['init', '--bare', '--initial-branch=main', bare]);
  execFileSync('git', ['clone', bare, seed]);
  const w = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });
  w(seed, ['config', 'user.email', 't@e.c']);
  w(seed, ['config', 'user.name', 'T']);
  writeFileSync(join(seed, 'seed.txt'), 'seed');
  w(seed, ['add', '-A']);
  w(seed, ['commit', '-m', 'seed']);
  w(seed, ['push', 'origin', 'HEAD:refs/heads/main']);
  return bare;
}



afterAll(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

describe('GitLfsRepository working-clone recovery (research decision 8)', () => {
  it('clones once and reuses the working clone across calls', async () => {
    const bare = makeBareWithSeed();
    const project = tempDir('bgl-rec-');
    const repo = new GitLfsRepository(project, bare);
    await repo.ensureWorkingClone();
    const firstClone = repo.workingCloneDir;
    expect(existsSync(join(firstClone, '.git'))).toBe(true);

    await repo.ensureWorkingClone();
    expect(repo.workingCloneDir).toBe(firstClone);
  }, 60_000);

  it('self-heals a dirty working clone (untracked + staged files) on next use', async () => {
    const bare = makeBareWithSeed();
    const project = tempDir('bgl-rec-');
    const repo = new GitLfsRepository(project, bare);
    await repo.ensureWorkingClone();

    const work = repo.workingCloneDir;
    // interrupted push debris: staged + untracked junk
    writeFileSync(join(work, 'staged.txt'), 'staged');
    writeFileSync(join(workDir(work), 'objects', 'junk.bin'), 'junk');
    execFileSync('git', ['add', '-A'], { cwd: work });

    await repo.ensureWorkingClone();

    expect(existsSync(join(work, 'staged.txt'))).toBe(false);
    expect(
      execFileSync('git', ['status', '--porcelain'], { cwd: work }).toString().trim(),
    ).toBe('');
  }, 60_000);

  it('re-clones from scratch when the clone is corrupt beyond reset', async () => {
    const bare = makeBareWithSeed();
    const project = tempDir('bgl-rec-');
    const repo = new GitLfsRepository(project, bare);
    await repo.ensureWorkingClone();

    // corrupt the clone beyond repair
    rmSync(join(repo.workingCloneDir, '.git'), { recursive: true, force: true });
    writeFileSync(join(repo.workingCloneDir, 'garbage.txt'), 'garbage');

    await repo.ensureWorkingClone();

    expect(existsSync(join(repo.workingCloneDir, '.git'))).toBe(true);
    expect(existsSync(join(repo.workingCloneDir, 'garbage.txt'))).toBe(false);
  }, 60_000);
});

function workDir(workClone: string): string {
  // objects dir may not exist yet; ensure it for the junk write
  mkdirSync(join(workClone, 'objects'), { recursive: true });
  return workClone;
}
