import { execFileSync } from 'node:child_process';

export function getOuterRepoUrl(cwd: string): string | null {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return null;
  }
}
