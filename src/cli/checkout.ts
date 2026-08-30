import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { guard } from '@/cli/common';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runCheckoutScan, writeCheckoutState, removeCheckoutState, isNonDefaultCheckout } from '@/mirror/checkout';
import { resolveAlias, RESERVED_ALIASES } from '@/mirror/alias';
import { GitLfsRepository } from '@/mirror/repository';
import { readFile, writeFile } from 'node:fs/promises';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { COMMANDS, BAZEL_FILES, DIRS } from '@/config/constants';
import { FsSnapshotStore } from '@/inspect/snapshot';

export interface CheckoutCliOptions {
  cwd: string;
  alias: string;
}

function isCustomAlias(alias: string): boolean {
  const resolved = resolveAlias(alias);
  return resolved === RESERVED_ALIASES.DEFAULT || resolved === RESERVED_ALIASES.LOCAL;
}

export async function runCheckoutCommand(opts: CheckoutCliOptions): Promise<number> {
  const projectDir = opts.cwd;
  const alias = opts.alias;

  const g = guard.checkInitialized(projectDir);
  if (!g.ok) {
    format.printResult({ ok: false, error: g.error }, { json: true });
    return EXIT_ERROR;
  }

  if (isCustomAlias(alias)) {
    return runCustomCheckout(projectDir, alias);
  }

  try {
    const objectsDir = join(projectDir, CONFIG_DIR_NAME, DIRS.OBJECTS);
    execFileSync('git', ['checkout', alias], { cwd: objectsDir, stdio: 'inherit' });
  } catch {
    format.printResult({ ok: false, error: `Failed to git checkout "${alias}" in inner repo` }, { json: true });
    return EXIT_ERROR;
  }

  format.printResult({ ok: true, command: COMMANDS.CHECKOUT, alias, message: `Switched to "${alias}" via git checkout, now applying URL patches` }, { json: true });
  return runCustomCheckout(projectDir, alias);
}

async function runCustomCheckout(projectDir: string, alias: string): Promise<number> {
  const store = new FsSnapshotStore();
  const snapshot = await store.read(projectDir);

  if (snapshot.hasConflicts) {
    const detail = snapshot.conflicts.map((c) => `"${c.repo}": ${c.adopted.sourceFile} vs ${c.divergent.sourceFile} (differing: ${c.differingFields.join(', ')})`).join('; ');
    format.printResult({
      ok: false,
      command: COMMANDS.CHECKOUT,
      error: `conflicting declarations for repository: ${detail}; run inspect and resolve before checkout`,
    }, { json: true });
    return EXIT_ERROR;
  }

  const remote = await guard.resolveDefaultRemote(projectDir);
  if (!remote.ok) {
    format.printResult({ ok: false, error: remote.error }, { json: true });
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

  const bazelFiles = [...BAZEL_FILES];

  const treeResult = await runCheckoutScan({
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
      const profile = await guard.resolveDefaultRemote(projectDir);
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
          // skip
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

  const allChanged = treeResult.changed;
  const output = {
    ok: treeResult.ok,
    command: COMMANDS.CHECKOUT,
    alias: treeResult.alias,
    target: treeResult.target,
    changes: treeResult.changes,
    changed: allChanged,
    unchanged: treeResult.unchanged,
    error: treeResult.error,
  };

  format.printResult(output, { json: true });

  if (treeResult.ok && allChanged > 0) {
    if (isNonDefaultCheckout(alias)) {
      await writeCheckoutState(projectDir, alias);
    } else {
      await removeCheckoutState(projectDir);
    }
  }

  return treeResult.ok ? EXIT_OK : EXIT_ERROR;
}