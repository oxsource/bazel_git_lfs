import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { guard } from '@/cli/common';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runCheckoutScan, writeCheckoutState, removeCheckoutState, isNonDefaultCheckout } from '@/mirror/checkout';
import { resolveAlias, RESERVED_ALIASES } from '@/mirror/alias';
import { parseManifest } from '@/mirror/manifest';
import { readFile, writeFile } from 'node:fs/promises';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { COMMANDS, BAZEL_FILES, DIRS, FILES } from '@/config/constants';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { MirrorManifest } from '@/mirror/models';

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

  const objectsDir = join(projectDir, CONFIG_DIR_NAME, DIRS.OBJECTS);

  // If the alias names a remote in the inner repo, treat it as a URL source
  // (replace dependency URLs to point at that remote) instead of a branch.
  if (isRemoteName(objectsDir, alias)) {
    return runCustomCheckout(projectDir, alias);
  }

  try {
    execFileSync('git', ['checkout', alias], { cwd: objectsDir, stdio: 'inherit' });
  } catch {
    format.printResult({ ok: false, error: `Failed to git checkout "${alias}" in inner repo` }, { json: true });
    return EXIT_ERROR;
  }

  format.printResult({ ok: true, command: COMMANDS.CHECKOUT, alias, message: `Switched to "${alias}" via git checkout, now applying URL patches` }, { json: true });
  return runCustomCheckout(projectDir, alias);
}

function isRemoteName(objectsDir: string, name: string): boolean {
  try {
    const remotes = execFileSync('git', ['remote'], { cwd: objectsDir, encoding: 'utf8', stdio: 'pipe' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return remotes.includes(name);
  } catch {
    return false;
  }
}

function getRemoteUrl(objectsDir: string, name: string): string | null {
  try {
    const url = execFileSync('git', ['remote', 'get-url', name], { cwd: objectsDir, encoding: 'utf8', stdio: 'pipe' }).trim();
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

/**
 * Read manifest.json for URL replacement. Tries the local working tree
 * first; if absent, fetches the target remote and reads it from FETCH_HEAD.
 * Returns undefined when no manifest is available.
 */
function readRemoteManifest(objectsDir: string, remoteName: string): MirrorManifest | undefined {
  // 1) Local working-tree manifest (e.g. after inspect -u downloaded objects).
  try {
    const localRaw = execFileSync('git', ['show', `HEAD:${FILES.MANIFEST}`], {
      cwd: objectsDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return parseManifest(localRaw);
  } catch {
    // fall through to remote fetch
  }
  // 2) Remote manifest.
  try {
    execFileSync('git', ['fetch', remoteName], { cwd: objectsDir, stdio: 'pipe' });
    const raw = execFileSync(
      'git',
      ['show', `FETCH_HEAD:${FILES.MANIFEST}`],
      { cwd: objectsDir, encoding: 'utf8', stdio: 'pipe' },
    );
    return parseManifest(raw);
  } catch {
    return undefined;
  }
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

  const objectsDir = join(projectDir, CONFIG_DIR_NAME, DIRS.OBJECTS);

  // Load the mirror manifest so original URLs can be restored and remote
  // targets know the object layout. Prefer the local working tree, then the
  // origin remote.
  let manifest: MirrorManifest | undefined;
  if (isCustomAlias(alias)) {
    manifest = readRemoteManifest(objectsDir, 'origin');
  } else {
    manifest = readRemoteManifest(objectsDir, alias);
  }

  const bazelFiles = [...BAZEL_FILES];

  const treeResult = await runCheckoutScan({
    alias,
    manifest,
    dependencies: snapshot.dependencies.map((d) => ({ name: d.name, sha256: d.sha256, urls: d.urls })),
    resolveTarget: async (a: string) => {
      const resolved = resolveAlias(a);
      if (resolved === RESERVED_ALIASES.DEFAULT) {
        return { type: 'original', baseUrl: '' };
      }
      if (resolved === RESERVED_ALIASES.LOCAL) {
        return { type: 'local', baseUrl: `file://${join(projectDir, CONFIG_DIR_NAME, DIRS.OBJECTS)}` };
      }
      // Alias names a remote in the inner repo → use its fetch URL.
      const remoteUrl = getRemoteUrl(objectsDir, a);
      if (remoteUrl) {
        return { type: 'remote', baseUrl: remoteUrl };
      }
      // Fallback: assume the alias is a branch; use the default remote URL.
      const originUrl = getRemoteUrl(objectsDir, 'origin');
      if (originUrl) {
        return { type: 'remote', baseUrl: originUrl };
      }
      throw new Error(`no remote named "${a}" and no origin remote available`);
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