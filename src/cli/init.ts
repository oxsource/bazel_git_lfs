import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { projectConfigDir, CONFIG_DIR_NAME } from '@/config/paths';
import { printResult, printError, EXIT_OK, EXIT_ERROR, OutputOptions } from '@/cli/format';

const GITIGNORE_ENTRY = '.bazel_git_lfs/';

export interface InitOptions extends OutputOptions {
  cwd: string;
}

export async function runInit(opts: InitOptions): Promise<number> {
  const dir = projectConfigDir(opts.cwd);
  const gitIgnorePath = join(opts.cwd, '.gitignore');

  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    printError(`Cannot create config directory at ${dir}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  if (isGitRepo(opts.cwd)) {
    await ensureGitIgnore(gitIgnorePath, opts);
  }

  printResult({ ok: true, configPath: dir, message: `Initialized config area at ${dir}` }, opts);
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
