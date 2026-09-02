import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { getOuterRepoUrl } from '@/hooks/outer-repo-url';
import { parseRemoteUrl } from '@/hooks/parse-remote-url';
import { GITHUB_WORKFLOW_DIR } from '@/config/constants';
import { renderVersionWorkflow, RELEASE_WORKFLOW_FILE } from '@/skill/version';

export interface SkillCliOptions {
  cwd: string;
  /** Positional argument, e.g. `skill github.workflow` or `skill list`. */
  name?: string;
}

const SKILLS = [
  {
    name: 'github.workflow',
    description: `npm-version-style tag-push release workflow (${join(GITHUB_WORKFLOW_DIR, RELEASE_WORKFLOW_FILE)})`,
    invocation: 'bazel-git-lfs skill github.workflow',
  },
  {
    name: 'list',
    description: 'List available skills',
    invocation: 'bazel-git-lfs skill list',
  },
];

export async function runSkillCommand(opts: SkillCliOptions): Promise<number> {
  if (opts.name === 'github.workflow') {
    return runVersionSkill(opts);
  }

  if (opts.name === 'list' || !opts.name) {
    format.printResult(
      {
        ok: true,
        command: 'skill',
        skills: SKILLS.map((s) => s.name),
        message: `Available skills:\n${SKILLS.map((s) => `- ${s.name}: ${s.description} (${s.invocation})`).join('\n')}`,
      },
      {},
    );
    return EXIT_OK;
  }

  format.printResult(
    {
      ok: false,
      error: `Unknown skill "${opts.name}". Run \`bazel-git-lfs skill list\` for available skills.`,
    },
    {},
  );
  return EXIT_OK;
}

async function runVersionSkill(opts: SkillCliOptions): Promise<number> {
  const hostRoot = hostRepoRoot(opts.cwd);
  if (!hostRoot) {
    format.printError('Not a git repository. Run the command inside a git repository.');
    return EXIT_ERROR;
  }

  const outerUrl = getOuterRepoUrl(hostRoot);
  const parsed = outerUrl ? parseRemoteUrl(outerUrl) : null;
  if (!parsed) {
    format.printError(
      'Could not detect the repository name from the origin remote. Configure the origin remote.',
    );
    return EXIT_ERROR;
  }
  const repo = parsed.repo;
  const group = parsed.group;

  process.stdout.write(`Suggested: ${group ? `${group}/${repo}` : repo}\n`);

  const targetDir = join(hostRoot, GITHUB_WORKFLOW_DIR);
  const target = join(targetDir, RELEASE_WORKFLOW_FILE);

  if (existsSync(target)) {
    format.printResult(
      {
        ok: true,
        command: 'skill',
        skill: 'github.workflow',
        path: target,
        message: `Warning: ${target} already exists — skipped writing`,
      },
      {},
    );
    return EXIT_OK;
  }

  const content = renderVersionWorkflow({ repo });

  try {
    await mkdir(targetDir, { recursive: true });
    await writeFile(target, content, 'utf8');
  } catch (err) {
    format.printError(`Failed to write ${target}: ${(err as Error).message}`);
    return EXIT_ERROR;
  }

  const relativeTarget = join(GITHUB_WORKFLOW_DIR, RELEASE_WORKFLOW_FILE);
  const commitMessage = `chore: add ${relativeTarget}`;
  try {
    execFileSync('git', ['add', relativeTarget], { cwd: hostRoot, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', commitMessage], { cwd: hostRoot, stdio: 'pipe' });
  } catch (err) {
    format.printResult(
      {
        ok: true,
        command: 'skill',
        skill: 'github.workflow',
        path: target,
        warning: `Created ${target} but auto-commit failed: ${(err as Error).message}`,
      },
      {},
    );
    return EXIT_OK;
  }

  format.printResult(
    {
      ok: true,
      command: 'skill',
      skill: 'github.workflow',
      path: target,
      message: `Created ${target}`,
    },
    {},
  );
  return EXIT_OK;
}

function hostRepoRoot(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return null;
  }
}
