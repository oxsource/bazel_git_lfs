import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { paths, CONFIG_DIR_NAME } from '@/config/paths';
import { format, EXIT_OK, EXIT_ERROR, OutputOptions } from '@/cli/format';
import { RESERVED_ALIASES } from '@/mirror/alias';
import { TOOL_NAME, FILES } from '@/config/constants';

const GITIGNORE_ENTRY = '.bazel_git_lfs/';

const PRE_COMMIT_HOOK = `#!/bin/sh
# bazel-git-lfs pre-commit hook: auto-restore URLs to original source before commit
set -e
PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [ -f "$PROJECT_DIR/${CONFIG_DIR_NAME}/${FILES.CHECKOUT_STATE}" ]; then
  echo "bazel-git-lfs: detected non-default checkout, restoring URLs..."
  if command -v ${TOOL_NAME} > /dev/null 2>&1; then
    ${TOOL_NAME} checkout ${RESERVED_ALIASES.DEFAULT}
    echo "bazel-git-lfs: URLs restored to original source before commit."
  else
    echo "bazel-git-lfs: warning - '${TOOL_NAME}' command not found, skipping auto-restore" >&2
  fi
fi
`;

export interface InitOptions extends OutputOptions {
  cwd: string;
}

export async function runInit(opts: InitOptions): Promise<number> {
  const dir = paths.projectConfigDir(opts.cwd);
  const gitIgnorePath = join(opts.cwd, '.gitignore');
  const objectsDir = join(dir, 'objects');

  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    format.printError(`Cannot create config directory at ${dir}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  try {
    await mkdir(objectsDir, { recursive: true });
  } catch (err) {
    format.printError(`Cannot create objects directory at ${objectsDir}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  try {
    execFileSync('git', ['init'], { cwd: objectsDir, stdio: 'pipe' });
  } catch (err) {
    format.printError(`Failed to initialize git repo in ${objectsDir}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  try {
    execFileSync('git', ['lfs', 'track', '*'], { cwd: objectsDir, stdio: 'pipe' });
  } catch {
    // git-lfs not installed — non-fatal, LFS tracking can be added later
  }

  if (isGitRepo(opts.cwd)) {
    await ensureGitIgnore(gitIgnorePath, opts);
    await installPreCommitHook(opts.cwd);
  }

  const result: Record<string, unknown> = {
    ok: true,
    configPath: dir,
    message: `Initialized config area at ${dir} with inner git repo at ${objectsDir}`,
  };
  format.printResult(result, opts);
  return EXIT_OK;
}

function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function installPreCommitHook(cwd: string): Promise<void> {
  const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd, encoding: 'utf8' }).trim();
  const hookPath = join(gitDir, 'hooks', 'pre-commit');
  try {
    await writeFile(hookPath, PRE_COMMIT_HOOK, { mode: 0o755 });
  } catch {
    // non-fatal
  }
}

async function ensureGitIgnore(gitIgnorePath: string, opts: InitOptions): Promise<void> {
  try {
    let content = '';
    try {
      content = await readFile(gitIgnorePath, 'utf8');
    } catch {
      // missing .gitignore is fine
    }

    if (content.includes(GITIGNORE_ENTRY)) {
      return;
    }

    const line =
      content.endsWith('\n') || content.length === 0 ? GITIGNORE_ENTRY : `\n${GITIGNORE_ENTRY}`;
    await writeFile(gitIgnorePath, content + line, 'utf8');
  } catch (err) {
    const message = `Config area created, but could not update ${gitIgnorePath}: ${(err as Error).message}`;
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          configPath: join(opts.cwd, CONFIG_DIR_NAME),
          warning: message,
        }) + '\n',
      );
    } else {
      process.stderr.write(`warning: ${message}\n`);
    }
  }
}