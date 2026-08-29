import { guard } from '@/cli/common';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runCheckoutScan, writeCheckoutState, removeCheckoutState, isNonDefaultCheckout, runExternalDepCheckout, PatchState } from '@/mirror/checkout';
import { resolveAlias, RESERVED_ALIASES } from '@/mirror/alias';
import { GitLfsRepository } from '@/mirror/repository';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { COMMANDS, BAZEL_FILES, DIRS } from '@/config/constants';
import { FsSnapshotStore } from '@/inspect/snapshot';
import { Dependency } from '@/inspect/models';

export interface CheckoutCliOptions {
  cwd: string;
  alias: string;
}

export async function runCheckoutCommand(opts: CheckoutCliOptions): Promise<number> {
  const projectDir = opts.cwd;
  const alias = opts.alias;

  const g = guard.checkInitialized(projectDir);
  if (!g.ok) {
    format.printResult({ ok: false, error: g.error }, { json: true });
    return EXIT_ERROR;
  }

  // Read snapshot for external-dep info and conflict checking.
  const store = new FsSnapshotStore();
  const snapshot = await store.read(projectDir);

  // Reject checkout if the snapshot has unresolved conflicts (FR-015).
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

  // Run project-tree checkout (Stage 5 behavior).
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

  // Run external-dep checkout (Phase 5 patch injection).
  const entryFiles: Record<string, string> = {};
  for (const name of bazelFiles) {
    const filePath = join(projectDir, name);
    try {
      entryFiles[name] = await readFile(filePath, 'utf8');
    } catch {
      // skip
    }
  }

  const conflictedRepos = new Set(snapshot.conflicts.map((c) => c.repo));
  const externalDeps: Dependency[] = snapshot.dependencies.filter((d) => d.origin === 'external-bzl');

  const { patches, skipped } = await runExternalDepCheckout(
    projectDir,
    alias,
    manifest,
    async (a: string) => {
      const resolved = resolveAlias(a);
      if (resolved === RESERVED_ALIASES.DEFAULT) return { type: 'original', baseUrl: '' };
      if (resolved === RESERVED_ALIASES.LOCAL) return { type: 'local', baseUrl: `file://${join(projectDir, CONFIG_DIR_NAME, DIRS.OBJECTS)}` };
      return { type: 'remote', baseUrl: remote.remote.url };
    },
    entryFiles,
    async (filePath: string, content: string) => {
      const absPath = join(projectDir, filePath);
      await writeFile(absPath, content, 'utf8');
    },
    externalDeps,
    conflictedRepos,
    snapshot,
  );

  // Combine results.
  const allChanged = treeResult.changed + patches.reduce((sum, p) => sum + p.changes.length, 0);
  const output = {
    ok: treeResult.ok,
    command: COMMANDS.CHECKOUT,
    alias: treeResult.alias,
    target: treeResult.target,
    changes: treeResult.changes,
    patches: patches.length > 0 ? patches : undefined,
    skipped: skipped.length > 0 ? skipped : undefined,
    changed: allChanged,
    unchanged: treeResult.unchanged,
    error: treeResult.error,
  };

  format.printResult(output, { json: true });

  // Update checkout state with patch info.
  if (treeResult.ok && allChanged > 0) {
    const statePatches: PatchState[] = patches.map((p) => ({
      repo: p.repo,
      injectedIn: p.injectedIn,
      command: '', // not stored in state for brevity; reconstructed on restore
      patchFile: p.patchFile,
    }));
    if (isNonDefaultCheckout(alias)) {
      await writeCheckoutState(projectDir, alias, statePatches.length > 0 ? statePatches : undefined);
    } else {
      await removeCheckoutState(projectDir);
    }
  }

  return treeResult.ok ? EXIT_OK : EXIT_ERROR;
}