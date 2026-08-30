import { parseRemoteUrl } from '@/hooks/parse-remote-url';
import { formatBranchSuggestion } from '@/hooks/branch-suggestion';

export function postRemoteAdd(exitCode: number, args: string[], _cwd: string): void {
  if (exitCode !== 0) return;

  const addIdx = args.indexOf('add');
  if (addIdx === -1 || addIdx + 2 >= args.length) return;

  const url = args[addIdx + 2];
  const parsed = parseRemoteUrl(url);
  if (!parsed) return;

  const message = formatBranchSuggestion(parsed.group, parsed.repo);
  process.stdout.write(message + '\n');
}