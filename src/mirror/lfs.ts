import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export class GitError extends Error {
  constructor(message: string, public readonly result: GitResult) {
    super(message);
    this.name = 'GitError';
  }
}

export interface RunOptions {
  env?: Record<string, string>;
  cwd?: string;
  /** Kill the process after this many ms (default 10 minutes). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000;

/**
 * Thin wrapper over system `git`/`git-lfs` (FR-015). Argument-array exec
 * only — no shell interpolation. Commands return their result without
 * throwing; callers decide which non-zero exits are fatal (FR-016: all
 * authentication is delegated to system git credential helpers).
 */
export class GitLfs {
  constructor(
    private readonly cwd: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async run(args: string[], options: RunOptions = {}): Promise<GitResult> {
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      ...options.env,
    };
    try {
      const { stdout, stderr } = await execFileAsync(args[0], args.slice(1), {
        cwd: options.cwd ?? this.cwd,
        env,
        timeout: options.timeoutMs ?? this.timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
      });
      return { status: 0, stdout, stderr };
    } catch (err) {
      const e = err as { code?: number; killed?: boolean; stdout?: string; stderr?: string };
      return { status: e.code ?? (e.killed ? 124 : 1), stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
  }

  async git(args: string[], options: RunOptions = {}): Promise<GitResult> {
    return this.run(['git', ...args], options);
  }

  async lfs(args: string[], options: RunOptions = {}): Promise<GitResult> {
    return this.run(['git-lfs', ...args], options);
  }

  mustOk(result: GitResult, context: string): GitResult {
    if (result.status !== 0) {
      throw new GitError(
        `${context} failed: ${summarizeStderr(result)}`,
        result,
      );
    }
    return result;
  }

  /** Clone with LFS smudge disabled (cheap clone; objects pulled on demand). */
  async clone(url: string, dest: string, cwd?: string): Promise<GitResult> {
    return this.git(['clone', url, dest], { env: { GIT_LFS_SKIP_SMUDGE: '1' }, cwd });
  }

  async fetch(remote = 'origin'): Promise<GitResult> {
    return this.git(['fetch', remote]);
  }

  async resetClean(branch: string): Promise<GitResult> {
    const reset = await this.git(['reset', '--hard', `origin/${branch}`]);
    if (reset.status !== 0) return reset;
    return this.git(['clean', '-fd']);
  }

  /** Idempotent: register the LFS tracking pattern in .gitattributes. */
  async lfsTrack(pattern: string): Promise<GitResult> {
    return this.lfs(['track', pattern]);
  }

  /** Materialize the given object paths from the LFS store. */
  async lfsPullInclude(paths: string[], remote = 'origin'): Promise<GitResult> {
    return this.lfs(['pull', remote, '--include', paths.join(',')]);
  }

  async addAll(): Promise<GitResult> {
    return this.git(['add', '-A']);
  }

  /** True when there are staged or unstaged changes (porcelain output). */
  async isDirty(): Promise<boolean> {
    const result = await this.git(['status', '--porcelain']);
    return result.status === 0 && result.stdout.trim().length > 0;
  }

  async commit(message: string): Promise<GitResult> {
    return this.git(['commit', '-m', message]);
  }

  async pullRebase(remote = 'origin', branch?: string): Promise<GitResult> {
    const args = branch ? ['pull', '--rebase', remote, branch] : ['pull', '--rebase'];
    return this.git(args);
  }

  async push(refspec?: string): Promise<GitResult> {
    return refspec ? this.git(['push', 'origin', refspec]) : this.git(['push']);
  }

  /** HEAD commit id, or null when the clone has no commits. */
  async head(): Promise<string | null> {
    const result = await this.git(['rev-parse', 'HEAD']);
    return result.status === 0 ? result.stdout.trim() : null;
  }

  /** Current checked-out branch, or null when detached/unborn. */
  async currentBranch(): Promise<string | null> {
    const result = await this.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const name = result.stdout.trim();
    return result.status === 0 && name.length > 0 && name !== 'HEAD' ? name : null;
  }
}

export function summarizeStderr(result: GitResult): string {
  const text = (result.stderr || result.stdout).trim();
  if (text.length === 0) return `exit code ${result.status}`;
  const firstLines = text.split('\n').slice(-3).join(' | ');
  return firstLines.length > 300 ? `${firstLines.slice(0, 300)}…` : firstLines;
}
