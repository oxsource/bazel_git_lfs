import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface QueryResult {
  externalRepos: string[];
  dependencyRelations: Record<string, string[]>;
}

const QUERY_TIMEOUT_MS = 10_000;

export async function runBazelQuery(
  projectDir: string,
  bazelBin = 'bazel',
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<QueryResult | null> {
  try {
    const { stdout } = await execFileAsync(bazelBin, ['query', '//external:*', '--output=label'], {
      cwd: projectDir,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    const externalRepos = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('external/'))
      .map((line) => line.replace(/^external\//, ''));

    return {
      externalRepos: [...new Set(externalRepos)],
      dependencyRelations: {},
    };
  } catch {
    return null;
  }
}
