import { checkInitialized, resolveDefaultRemote } from '@/cli/common';
import { printResult, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runCheckoutScan, writeCheckoutState, removeCheckoutState, isNonDefaultCheckout } from '@/mirror/checkout';
import { resolveAlias, RESERVED_ALIASES } from '@/mirror/alias';
import { GitLfsRepository } from '@/mirror/repository';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { COMMANDS, BAZEL_FILES, DIRS } from '@/config/constants';

export interface CheckoutCliOptions {
  cwd: string;
  alias: string;
}

export async function runCheckoutCommand(opts: CheckoutCliOptions): Promise<number> {
  const projectDir = opts.cwd;
  const alias = opts.alias;

  const guard = checkInitialized(projectDir);
  if (!guard.ok) {
    printResult({ ok: false, error: guard.error }, { json: true });
    return EXIT_ERROR;
  }

  const remote = await resolveDefaultRemote(projectDir);
  if (!remote.ok) {
    printResult({ ok: false, error: remote.error }, { json: true });
    return EXIT_ERROR;
  }

  const repo = new GitLfsRepository(projectDir, remote.remote.url);
  let manifest;
  try {
    await repo.ensureWorkingClone();
    const result = await repo.readManifest();
    manifest = result.manifest;
  } catch {
    manifest = undefined;
  }

  const bazelFiles = BAZEL_FILES;

  const result = await runCheckoutScan({
    alias,
    manifest,
    resolveTarget: async (a: string) => {
      const resolved = resolveAlias(a);
      if (resolved === RESERVED_ALIASES.DEFAULT) {
        return { type: 'original', baseUrl: '' };
      }
      if (resolved === RESERVED_ALIASES.LOCAL) {
        return { type: 'local', baseUrl: `file://${join(projectDir, CONFIG_DIR_NAME, DIRS.OBJECTS)}` };
      }
      const profile = await resolveDefaultRemote(projectDir);
      if (!profile.ok) {
        throw new Error(profile.error);
      }
      return { type: 'remote', baseUrl: profile.remote.url };
    },
    readFiles: async () => {
      const files: Record<string, string> = {};
      for (const name of bazelFiles) {
        const filePath = join(projectDir, name);
        try {
          files[name] = await readFile(filePath, 'utf8');
        } catch {
          // file doesn't exist, skip
        }
      }
      return files;
    },
    rewriteFile: async (filePath: string, content: string, _before: string, _after: string) => {
      const absPath = join(projectDir, filePath);
      await writeFile(absPath, content, 'utf8');
      return true;
    },
  });

  const output = {
    ok: result.ok,
    command: COMMANDS.CHECKOUT,
    alias: result.alias,
    target: result.target,
    changes: result.changes,
    changed: result.changed,
    unchanged: result.unchanged,
    error: result.error,
  };

  printResult(output, { json: true });

  if (result.ok && result.changed > 0) {
    if (isNonDefaultCheckout(alias)) {
      await writeCheckoutState(projectDir, alias);
    } else {
      await removeCheckoutState(projectDir);
    }
  }

  return result.ok ? EXIT_OK : EXIT_ERROR;
}