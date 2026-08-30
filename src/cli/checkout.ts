import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { guard } from '@/cli/common';
import { EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { runCheckoutScan, writeCheckoutState, removeCheckoutState, isNonDefaultCheckout } from '@/mirror/checkout';
import { resolveAlias, RESERVED_ALIASES } from '@/mirror/alias';
import { parseManifest } from '@/mirror/manifest';
import { parseRemoteUrl } from '@/hooks/parse-remote-url';
import { readFile, writeFile } from 'node:fs/promises';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { BAZEL_FILES, DIRS, FILES } from '@/config/constants';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { MirrorManifest } from '@/mirror/models';
import { ensureLocalServer, stopLocalServer, isLocalServerRunning, LOCAL_SERVER_PORT } from '@/server/local-server';

export interface CheckoutCliOptions {
  cwd: string;
  alias: string;
}

function isLocalAlias(alias: string): boolean {
  return resolveAlias(alias) === RESERVED_ALIASES.LOCAL;
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
    process.stderr.write(`error: ${g.error}\n`);
    return EXIT_ERROR;
  }

  // Switching to local source starts the object HTTP server; any other
  // target stops it. If already running, the server is reused.
  if (isLocalAlias(alias)) {
    const { baseUrl, pid } = await ensureLocalServer(projectDir);
    process.stdout.write(`Local object server started: ${baseUrl} (pid ${pid})\n`);
  } else if (isLocalServerRunning(projectDir)) {
    stopLocalServer(projectDir);
    process.stdout.write('Local object server stopped\n');
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
    process.stderr.write(`error: Failed to git checkout "${alias}" in inner repo\n`);
    return EXIT_ERROR;
  }

  process.stdout.write(`Switched to "${alias}" via git checkout, now applying URL patches\n`);
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

function currentBranch(objectsDir: string): string {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: objectsDir,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
    return branch && branch !== 'HEAD' ? branch : 'main';
  } catch {
    return 'main';
  }
}

/**
 * Build a raw-file base URL for the remote's hosting platform so objects can
 * be fetched over HTTPS. The format depends on the remote's host:
 *   - github.com        → https://media.githubusercontent.com/media/<group>/<repo>/refs/heads/<branch>
 *   - gitlab.com or *.gitlab.* → https://<host>/<group>/<repo>/-/raw/<branch>
 *   - gitee.com         → https://gitee.com/<group>/<repo>/raw/<branch>
 *   - bitbucket.org     → https://bitbucket.org/<group>/<repo>/raw/<branch>
 *   - other (self-hosted GitLab/Gitea/etc.) → https://<host>/<group>/<repo>/raw/<branch>
 */
function remoteFileBaseUrl(objectsDir: string, remoteName: string): string | null {
  const url = getRemoteUrl(objectsDir, remoteName);
  if (!url) return null;
  const parsed = parseRemoteUrl(url);
  if (!parsed) return null;
  const branch = currentBranch(objectsDir);

  const host = parsed.host.toLowerCase();
  const { group, repo } = parsed;

  if (host === 'github.com' || host === 'www.github.com') {
    return `https://media.githubusercontent.com/media/${group}/${repo}/refs/heads/${branch}`;
  }
  if (host === 'gitlab.com' || host === 'www.gitlab.com' || host.includes('gitlab')) {
    return `https://${parsed.host}/${group}/${repo}/-/raw/${branch}`;
  }
  if (host === 'gitee.com' || host === 'www.gitee.com') {
    return `https://gitee.com/${group}/${repo}/raw/${branch}`;
  }
  if (host === 'bitbucket.org' || host === 'www.bitbucket.org') {
    return `https://bitbucket.org/${group}/${repo}/raw/${branch}`;
  }
  // Generic fallback: https://host/group/repo/raw/<branch>
  return `https://${parsed.host}/${group}/${repo}/raw/${branch}`;
}

/**
 * Read manifest.json (non-versioned, at .bazel_git_lfs/manifest.json) for URL
 * replacement. Returns undefined when absent or unparsable.
 */
async function readRemoteManifest(projectDir: string, _remoteName: string): Promise<MirrorManifest | undefined> {
  const manifestPath = join(projectDir, CONFIG_DIR_NAME, FILES.MANIFEST);
  try {
    const raw = await readFile(manifestPath, 'utf8');
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
    process.stderr.write(`error: conflicting declarations for repository: ${detail}; run inspect and resolve before checkout\n`);
    return EXIT_ERROR;
  }

  const objectsDir = join(projectDir, CONFIG_DIR_NAME, DIRS.OBJECTS);

  // Load the mirror manifest (non-versioned, at .bazel_git_lfs/manifest.json)
  // so original URLs can be restored and remote targets know the object layout.
  const manifest = await readRemoteManifest(projectDir, alias);

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
        return { type: 'local', baseUrl: `http://localhost:${LOCAL_SERVER_PORT}` };
      }
      // Alias names a remote in the inner repo → use its raw-file base URL.
      const baseUrl = remoteFileBaseUrl(objectsDir, a);
      if (baseUrl) {
        return { type: 'remote', baseUrl };
      }
      // Fallback: assume the alias is a branch; use the origin remote.
      const originBaseUrl = remoteFileBaseUrl(objectsDir, 'origin');
      if (originBaseUrl) {
        return { type: 'remote', baseUrl: originBaseUrl };
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

  // Human-readable output:  [n] name, old url --> new url  (one line per change)
  if (treeResult.error) {
    process.stderr.write(`error: ${treeResult.error}\n`);
  }
  treeResult.changes.forEach((change, i) => {
    process.stdout.write(`[${i + 1}] ${change.dependency}, ${change.before} --> ${change.after}\n`);
  });
  if (allChanged === 0 && !treeResult.error) {
    process.stdout.write(`No URL changes for "${treeResult.alias}" (${treeResult.unchanged} unchanged)\n`);
  }

  if (treeResult.ok && allChanged > 0) {
    if (isNonDefaultCheckout(alias)) {
      await writeCheckoutState(projectDir, alias);
    } else {
      await removeCheckoutState(projectDir);
    }
  }

  return treeResult.ok ? EXIT_OK : EXIT_ERROR;
}