import { describe, expect, it, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSkillCommand } from '@/cli/skill';
import { EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { renderVersionWorkflow } from '@/skill/version';

describe('skill command', () => {
  const repos: string[] = [];

  afterAll(() => {
    for (const r of repos) {
      rmSync(r, { recursive: true, force: true });
    }
  });

  function makeGitRepo(): string {
    const root = mkdtempSync(join(tmpdir(), 'bgl-skill-'));
    const repo = join(root, 'host');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:oxsource/bazle_git_lfs.git'], {
      cwd: repo,
    });
    repos.push(repo);
    return repo;
  }

  it('writes release.yml with the repo derived from origin and auto-commits', async () => {
    const repo = makeGitRepo();

    const code = await runSkillCommand({ cwd: repo, name: 'github.workflow' });

    expect(code).toBe(EXIT_OK);
    const target = join(repo, '.github', 'workflows', 'release.yml');
    expect(existsSync(target)).toBe(true);
    const content = readFileSync(target, 'utf8');
    expect(content).toContain('name: version');
    expect(content).toContain("- 'v*'");
    expect(content).toContain('bazle_git_lfs-${{ github.ref_name }}.tar.gz');

    const log = execFileSync('git', ['log', '-1', '--pretty=%s'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
    expect(log).toContain('release.yml');
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
    expect(status).toBe('');
  });

  it('skips writing and warns when the workflow file already exists', async () => {
    const repo = makeGitRepo();
    const target = join(repo, '.github', 'workflows', 'release.yml');
    mkdirSync(join(repo, '.github', 'workflows'), { recursive: true });
    writeFileSync(target, 'existing');

    const code = await runSkillCommand({ cwd: repo, name: 'github.workflow' });

    expect(code).toBe(EXIT_OK);
    expect(readFileSync(target, 'utf8')).toBe('existing');
    let headExists = true;
    try {
      execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repo, stdio: 'pipe' });
    } catch {
      headExists = false;
    }
    expect(headExists).toBe(false);
  });

  it('lists available skills on bare invocation and via list', async () => {
    const repo = makeGitRepo();

    const bare = await runSkillCommand({ cwd: repo });
    const listed = await runSkillCommand({ cwd: repo, name: 'list' });

    expect(bare).toBe(EXIT_OK);
    expect(listed).toBe(EXIT_OK);
  });

  it('fails when not in a git repository', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bgl-skill-'));
    repos.push(root);

    const code = await runSkillCommand({ cwd: root, name: 'github.workflow' });

    expect(code).toBe(EXIT_ERROR);
  });

  it('renders the version template', () => {
    const out = renderVersionWorkflow({ repo: 'acme' });

    expect(out).toContain('name: version');
    expect(out).toContain("tags:\n      - 'v*'");
    expect(out).toContain('--prefix="acme-${{ github.ref_name }}/"');
    expect(out).toContain('files: "acme-${{ github.ref_name }}.tar.gz"');
  });
});
