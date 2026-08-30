import prompts from 'prompts';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parseRemoteUrl } from '@/hooks/parse-remote-url';
import { suggestBranchName, formatBranchSuggestion } from '@/hooks/branch-suggestion';
import { CONFIG_DIR_NAME } from '@/config/paths';

export async function postRemoteAdd(exitCode: number, args: string[], cwd: string): Promise<void> {
  if (exitCode !== 0) return;

  const addIdx = args.indexOf('add');
  if (addIdx === -1 || addIdx + 2 >= args.length) return;

  const url = args[addIdx + 2];
  const parsed = parseRemoteUrl(url);
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
  }
}