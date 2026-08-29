import type { MirrorManifest } from '@/mirror/models';
import { resolveAlias, RESERVED_ALIASES } from '@/mirror/alias';
import { existsSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { COMMANDS, ARCHIVE_SUFFIXES, FILES } from '@/config/constants';
import { ExternalResolver } from '@/inspect/external-resolver';
import { Dependency, DependencyConflict } from '@/inspect/models';
import { generatePatch, buildPatchCommand, injectPatchCmds, writeAuditPatch } from '@/mirror/patch';

export const CHECKOUT_STATE_FILE = FILES.CHECKOUT_STATE;

function checkoutStatePath(projectDir: string): string {
  return join(projectDir, CONFIG_DIR_NAME, CHECKOUT_STATE_FILE);
}

export interface CheckoutState {
  alias: string;
  appliedAt: string;
  patches?: PatchState[];
}

export interface PatchState {
  repo: string;
  injectedIn: string;
  command: string;
  patchFile: string;
}

export async function readCheckoutState(projectDir: string): Promise<CheckoutState | null> {
  const statePath = checkoutStatePath(projectDir);
  if (!existsSync(statePath)) return null;
  try {
    const raw = await readFile(statePath, 'utf8');
    return JSON.parse(raw) as CheckoutState;
  } catch {
    return null;
  }
}

export async function writeCheckoutState(projectDir: string, alias: string, patches?: PatchState[]): Promise<void> {
  const state: CheckoutState = { alias, appliedAt: new Date().toISOString(), patches };
  await writeFile(checkoutStatePath(projectDir), JSON.stringify(state, null, 2), 'utf8');
}

export async function removeCheckoutState(projectDir: string): Promise<void> {
  const statePath = checkoutStatePath(projectDir);
  if (existsSync(statePath)) {
    await unlink(statePath);
  }
}

export function isNonDefaultCheckout(alias: string): boolean {
  const resolved = resolveAlias(alias);
  return resolved !== RESERVED_ALIASES.DEFAULT;
}

export interface CheckoutChange {
  file: string;
  dependency: string;
  before: string;
  after: string;
}

export interface PatchRecord {
  repo: string;
  patchFile: string;
  injectedIn: string;
  changes: CheckoutChange[];
}

export interface SkippedRepo {
  repo: string;
  reason: string;
}

export interface CheckoutResult {
  ok: boolean;
  command: typeof COMMANDS.CHECKOUT;
  alias: string;
  target: string;
  changes: CheckoutChange[];
  changed: number;
  unchanged: number;
  patches?: PatchRecord[];
  skipped?: SkippedRepo[];
  error?: string;
}

export interface CheckoutTarget {
  type: 'original' | 'local' | 'remote';
  baseUrl: string;
}

export interface CheckoutDeps {
  alias: string;
  manifest?: MirrorManifest;
  resolveTarget: (alias: string) => Promise<CheckoutTarget>;
  readFiles: () => Promise<Record<string, string>>;
  rewriteFile: (path: string, content: string, before: string, after: string) => Promise<boolean>;
}

function stripArchiveExt(name: string): string {
  for (const ext of ARCHIVE_SUFFIXES) {
    if (name.endsWith(ext)) return name.slice(0, -ext.length);
  }
  return name;
}

function deriveDepName(url: string): string {
  const last = url.replace(/\/$/, '').split('/').pop() || '';
  return stripArchiveExt(last);
}

// Exported for testing
export function findDependencyUrl(
  content: string,
  depName: string,
): string | null {
  const lines = content.split('\n');
  let inBlock = false;
  let currentName = '';

  for (const line of lines) {
    const nameMatch = line.match(/name\s*=\s*"([^"]+)"/);
    if (nameMatch) {
      currentName = nameMatch[1];
      inBlock = currentName === depName;
    }
    if (inBlock) {
      const urlMatch = line.match(/urls?\s*=\s*\[?"?([^"\]]+)"?\]?/);
      if (urlMatch) return urlMatch[1];
      if (line.includes(')') && !line.includes('name')) {
        inBlock = false;
      }
    }
  }
  return null;
}

// Exported for testing
export function replaceDependencyUrl(
  content: string,
  depName: string,
  newUrl: string,
): { changed: boolean; newContent: string } {
  const lines = content.split('\n');
  let inBlock = false;
  let currentName = '';
  let changed = false;

  const result = lines.map((line) => {
    const nameMatch = line.match(/name\s*=\s*"([^"]+)"/);
    if (nameMatch) {
      currentName = nameMatch[1];
      inBlock = currentName === depName;
    }
    if (inBlock) {
      const urlMatch = line.match(/^(\s*urls?\s*=\s*\[?"?)([^"\]]+)/);
      if (urlMatch) {
        const before = urlMatch[2];
        if (before !== newUrl) {
          changed = true;
          const suffix = line.slice(urlMatch[0].length);
          return `${urlMatch[1]}${newUrl}${suffix}`;
        }
      }
      if (line.includes(')') && !line.includes('name')) {
        inBlock = false;
      }
    }
    return line;
  });

  return { changed, newContent: result.join('\n') };
}

export async function runCheckoutScan(deps: CheckoutDeps): Promise<CheckoutResult> {
  const alias = resolveAlias(deps.alias);
  const target = await deps.resolveTarget(alias);
  const changes: CheckoutChange[] = [];
  let unchanged = 0;

  const files = await deps.readFiles();
  const manifest = deps.manifest;

  if (target.type === 'original' || target.type === 'remote') {
    if (!manifest) {
      return { ok: false, command: COMMANDS.CHECKOUT, alias, target: target.type, changes: [], changed: 0, unchanged: 0, error: 'mirror manifest is required for this target' };
    }

    for (const [sha256, entry] of Object.entries(manifest.objects)) {
      const originalUrl = entry.sources[0];
      const depName = deriveDepName(originalUrl);

      let found = false;
      for (const [filePath, content] of Object.entries(files)) {
        const currentUrl = findDependencyUrl(content, depName);
        if (currentUrl === null) continue;
        found = true;

        const targetUrl = target.type === 'original' ? originalUrl : `${target.baseUrl}/${sha256}/${entry.path}`;

        if (currentUrl === targetUrl) {
          unchanged++;
          continue;
        }

        const { changed, newContent } = replaceDependencyUrl(content, depName, targetUrl);
        if (changed) {
          const written = await deps.rewriteFile(filePath, newContent, currentUrl, targetUrl);
          if (written) {
            changes.push({ file: filePath, dependency: depName, before: currentUrl, after: targetUrl });
          }
        } else {
          unchanged++;
        }
      }
      if (!found) unchanged++;
    }
  }

  return {
    ok: true,
    command: COMMANDS.CHECKOUT,
    alias,
    target: target.type,
    changes,
    changed: changes.length,
    unchanged,
  };
}

/**
 * Process external-bzl dependencies via patch injection.
 * Re-resolves declaring repos, generates patches, injects patch_cmds, writes audit patches.
 */
export async function runExternalDepCheckout(
  projectDir: string,
  alias: string,
  manifest: MirrorManifest | undefined,
  resolveTarget: (alias: string) => Promise<CheckoutTarget>,
  entryFiles: Record<string, string>,
  rewriteEntry: (filePath: string, content: string) => Promise<void>,
  externalDeps: Dependency[],
  conflictedRepos: Set<string>,
  snapshot: { hasConflicts: boolean; conflicts: DependencyConflict[] },
): Promise<{ patches: PatchRecord[]; skipped: SkippedRepo[] }> {
  const patches: PatchRecord[] = [];
  const skipped: SkippedRepo[] = [];
  const target = await resolveTarget(alias);

  // Group deps by declaring repo.
  const repoDeps = new Map<string, Dependency[]>();
  for (const dep of externalDeps) {
    if (dep.origin !== 'external-bzl' || !dep.fromRepo) continue;
    const existing = repoDeps.get(dep.fromRepo) ?? [];
    existing.push(dep);
    repoDeps.set(dep.fromRepo, existing);
  }

  const resolver = new ExternalResolver(projectDir);

  try {
    for (const [repo, deps] of repoDeps) {
      // Skip conflicted repos.
      if (conflictedRepos.has(repo) || snapshot.hasConflicts) {
        skipped.push({ repo, reason: 'repository has conflicting declarations; run inspect and resolve before checkout' });
        continue;
      }

      // Find the sourceDep for this repo from the entry-file deps.
      const sourceDep: Dependency | undefined = deps.find((d) => d.name === repo && d.origin === 'entry');

      // Resolve the repo content.
      const resolution = await resolver.resolve(repo, sourceDep);
      if (resolution.status === 'unresolved' || !resolution.rootDir) {
        skipped.push({ repo, reason: 'repository content unresolved at checkout time (no sandbox match, download refused)' });
        continue;
      }

      // Read bzl files and find each dep's declaration.
      const repoChanges: CheckoutChange[] = [];
      let originalBzlContent = '';
      let rewrittenBzlContent = '';
      let bzlPath = '';

      for (const dep of deps) {
        // Determine the bzl file path from the loadChain.
        const loadTarget = dep.loadChain[dep.loadChain.length - 1];
        if (!loadTarget) continue;
        // Parse bzl path from the load target.
        const bzlFile = parseBzlPath(loadTarget);
        if (!bzlFile) continue;
        bzlPath = bzlFile;

        // Determine the target URL.
        let targetUrl: string | null = null;
        if (target.type === 'original') {
          targetUrl = dep.urls[0] ?? null;
        } else if (manifest) {
          // Look up by sha256 in manifest.
          if (dep.sha256) {
            const entry = manifest.objects[dep.sha256];
            if (entry) {
              targetUrl = `${target.baseUrl}/${dep.sha256}/${entry.path}`;
            }
          }
        } else {
          targetUrl = dep.urls[0] ?? null;
        }

        if (!targetUrl) {
          skipped.push({ repo, reason: `cannot determine target URL for "${dep.name}" (sha256 ${dep.sha256 ?? 'none'} not in manifest)` });
          continue;
        }

        // Read bzl content.
        const bzlAbsPath = join(resolution.rootDir, bzlFile);
        let bzlContent: string;
        try {
          bzlContent = await readFile(bzlAbsPath, 'utf8');
        } catch {
          skipped.push({ repo, reason: `cannot read bzl file "${bzlFile}" in repo "${repo}"` });
          continue;
        }

        if (!originalBzlContent) originalBzlContent = bzlContent;
        rewrittenBzlContent = bzlContent;

        // Replace URL in the bzl content.
        const currentUrl = findDependencyUrl(rewrittenBzlContent, dep.name);
        if (currentUrl === null) {
          skipped.push({ repo, reason: `cannot find "${dep.name}" declaration in "${bzlFile}"` });
          continue;
        }

        if (currentUrl !== targetUrl) {
          const { changed, newContent } = replaceDependencyUrl(rewrittenBzlContent, dep.name, targetUrl);
          if (changed) {
            rewrittenBzlContent = newContent;
            repoChanges.push({ file: loadTarget, dependency: dep.name, before: currentUrl, after: targetUrl });
          }
        }
      }

      if (repoChanges.length === 0) {
        // No changes needed for this repo.
        continue;
      }

      // Generate patch.
      const patchContent = generatePatch(originalBzlContent, rewrittenBzlContent);
      if (!patchContent) continue;

      // Write audit patch.
      const patchFile = await writeAuditPatch(projectDir, repo, patchContent);

      // Build patch_cmds command.
      const patchCmd = buildPatchCommand({
        repo,
        pathInsideRepo: bzlPath,
        oldUrls: repoChanges.map((c) => c.before),
        newUrl: repoChanges[0].after,
      });

      // Inject into entry file.
      for (const [filePath, content] of Object.entries(entryFiles)) {
        const newContent = injectPatchCmds(content, repo, patchCmd);
        if (newContent !== content) {
          await rewriteEntry(filePath, newContent);
          entryFiles[filePath] = newContent;
          patches.push({
            repo,
            patchFile,
            injectedIn: filePath,
            changes: repoChanges,
          });
          break;
        }
      }
    }
  } finally {
    await resolver.cleanup().catch(() => {});
  }

  return { patches, skipped };
}

function parseBzlPath(loadTarget: string): string | null {
  // Form: @repo//path:file.bzl or @repo//path/file.bzl
  const sep = loadTarget.indexOf('//');
  if (sep < 0) return null;
  const pathPart = loadTarget.slice(sep + 2);
  if (pathPart.includes(':')) {
    return pathPart.slice(pathPart.indexOf(':') + 1);
  }
  return pathPart;
}