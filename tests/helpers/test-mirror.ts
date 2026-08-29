import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export interface RunOpts {
  cwd?: string;
  env?: Record<string, string>;
}

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface TestMirror {
  /** Base temp directory holding both repositories. */
  baseDir: string;
  /** Bare repository path — the "remote" a project's remote profile would point at. */
  barePath: string;
  /** Non-bare clone the test uses to seed/inspect mirror content directly. */
  workPath: string;
  /** Run git in the working clone (prompts disabled). */
  git: (args: string[], opts?: RunOpts) => RunResult;
  /** Run git-lfs in the working clone. */
  lfs: (args: string[], opts?: RunOpts) => RunResult;
  /** Stage + commit everything in the working clone (empty commits allowed). */
  commitAll: (message: string) => void;
  /** Read a text file from the working clone. */
  readWorkFile: (relPath: string) => string;
  /** Write a file (creating parent dirs) into the working clone. */
  writeWorkFile: (relPath: string, content: Buffer | string) => void;
  /** Default branch name. */
  branch: string;
  /** Delete the whole temp mirror tree. */
  close: () => void;
}

function runCmd(cmd: string, args: string[], opts: RunOpts = {}): RunResult {
  try {
    const out = execFileSync(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env, GIT_TERMINAL_PROMPT: '0' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: out ?? '', stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function mustOk(result: RunResult, context: string): void {
  if (result.status !== 0) {
    throw new Error(`${context} failed in test mirror: ${result.stderr || result.stdout}`);
  }
}

/**
 * Whether `git lfs` works on this machine. Lets LFS-dependent integration
 * tests skip cleanly on machines/CI runners without git-lfs installed
 * (e.g. `it.skipIf(!gitLfsAvailable())`).
 */
export function gitLfsAvailable(): boolean {
  return runCmd('git', ['lfs', 'version']).status === 0;
}

/**
 * Create a throwaway Git + Git LFS "remote" for integration tests:
 * a bare repository (the URL a project's remote profile would point at) plus
 * a non-bare working clone used to seed/inspect the mirror. LFS is installed
 * repo-scoped (`git lfs install --local`) so no global git config is touched,
 * and `objects/**` is LFS-tracked from the first commit.
 */
export function createTestMirror(namePrefix = 'bgl-mirror-'): TestMirror {
  const base = mkdtempSync(join(tmpdir(), namePrefix));
  const barePath = join(base, 'mirror.git');
  const workPath = join(base, 'mirror-work');

  const gitOk = (cwd: string, args: string[]): void => {
    const r = runCmd('git', args, { cwd });
    mustOk(r, `git ${args.join(' ')}`);
  };
  const commitAll = (message: string): void => {
    gitOk(workPath, ['add', '-A']);
    const r = runCmd('git', ['commit', '-m', message, '--allow-empty'], { cwd: workPath });
    if (r.status !== 0) {
      throw new Error(`commit failed in test mirror: ${r.stderr}`);
    }
  };

  mkdirSync(barePath, { recursive: true });
  gitOk(barePath, ['init', '--bare', '--initial-branch=main']);
  gitOk(barePath, ['config', 'user.email', 'test@example.com']);
  gitOk(barePath, ['config', 'user.name', 'Test']);

  gitOk(base, ['clone', barePath, 'mirror-work']);
  gitOk(workPath, ['config', 'user.email', 'test@example.com']);
  gitOk(workPath, ['config', 'user.name', 'Test']);
  gitOk(workPath, ['lfs', 'install', '--local']);
  mkdirSync(join(workPath, 'objects'), { recursive: true });
  writeFileSync(join(workPath, '.gitattributes'), 'objects/** filter=lfs diff=lfs merge=lfs -text\n');
  commitAll('init lfs tracking');

  return {
    baseDir: base,
    barePath,
    workPath,
    git: (args, opts = {}) => runCmd('git', args, { cwd: workPath, ...opts }),
    lfs: (args, opts = {}) => runCmd('git-lfs', args, { cwd: workPath, ...opts }),
    commitAll,
    readWorkFile: (relPath) => readFileSync(join(workPath, relPath), 'utf8'),
    writeWorkFile(relPath, content) {
      const target = join(workPath, relPath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    },
    branch: 'main',
    close: () => rmSync(base, { recursive: true, force: true }),
  };
}
