import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { paths, CONFIG_DIR_NAME } from '@/config/paths';
import { format, EXIT_OK, EXIT_ERROR, OutputOptions } from '@/cli/format';
import { readCheckoutState } from '@/mirror/checkout';
import { RESERVED_ALIASES } from '@/mirror/alias';
import { COMMANDS, TOOL_NAME, FILES } from '@/config/constants';

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

  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    format.printError(`Cannot create config directory at ${dir}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  if (isGitRepo(opts.cwd)) {
    await ensureGitIgnore(gitIgnorePath, opts);
    await installPreCommitHook(opts.cwd);
  }

  const warnings: string[] = [];

  const state = await readCheckoutState(opts.cwd);
  if (state) {
    warnings.push(`Non-default checkout detected (alias: "${state.alias}"). Run "${TOOL_NAME} ${COMMANDS.CHECKOUT} ${RESERVED_ALIASES.DEFAULT}" to restore original URLs before committing.`);
  }

  const result: Record<string, unknown> = { ok: true, configPath: dir, message: `Initialized config area at ${dir}` };
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
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
    // non-fatal: hook installation is best-effort
  }
}

async function ensureGitIgnore(gitIgnorePath: string, opts: InitOptions): Promise<void> {
  try {
    let content = '';
    try {
      content = await readFile(gitIgnorePath, 'utf8');
    } catch {
      // missing .gitignore is fine; will create it
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
