import prompts from 'prompts';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parseRemoteUrl } from '@/hooks/parse-remote-url';
import { suggestBranchName, formatBranchSuggestion } from '@/hooks/branch-suggestion';
import { CONFIG_DIR_NAME } from '@/config/paths';

function getOuterRepoUrl(cwd: string): string | null {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

export async function postRemoteAdd(exitCode: number, args: string[], cwd: string): Promise<void> {
  if (exitCode !== 0) return;

  // args = ['remote', 'add', <name>, <url>] from the interceptor passthrough.
  const remoteName = args[2];

  const outerUrl = getOuterRepoUrl(cwd);
  if (!outerUrl) return;

  const parsed = parseRemoteUrl(outerUrl);
  if (!parsed) return;

  process.stdout.write(formatBranchSuggestion(parsed.group, parsed.repo) + '\n');

  if (!process.stdout.isTTY) return;

  const suggested = suggestBranchName(parsed.group, parsed.repo);
  const { branch } = await prompts({
    type: 'text',
    name: 'branch',
    message: 'Create branch',
    initial: suggested,
  });

  if (!branch) return;

  const objectsDir = join(cwd, CONFIG_DIR_NAME, 'objects');
  try {
    execFileSync('git', ['checkout', '-b', branch], { cwd: objectsDir, stdio: 'pipe' });
    process.stdout.write(`Switched to new branch "${branch}"\n`);
  } catch (err) {
    process.stderr.write(`warning: failed to create branch "${branch}": ${(err as Error).message}\n`);
    return;
  }

  // Set the push upstream so subsequent `bazel-git-lfs push` works without
  // extra arguments. Configuring branch tracking is safe even when the remote
  // has no commits yet (no actual push happens here).
  if (remoteName) {
    try {
      execFileSync('git', ['config', `branch.${branch}.remote`, remoteName], { cwd: objectsDir, stdio: 'pipe' });
      execFileSync('git', ['config', `branch.${branch}.merge`, `refs/heads/${branch}`], { cwd: objectsDir, stdio: 'pipe' });
      process.stdout.write(`Set upstream "${remoteName}/${branch}" for push\n`);
    } catch (err) {
      process.stderr.write(`warning: failed to set upstream for "${branch}": ${(err as Error).message}\n`);
    }
  }
}
