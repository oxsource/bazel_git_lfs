import type { MirrorManifest } from '@/mirror/models';
import { resolveAlias, RESERVED_ALIASES } from '@/mirror/alias';
import { existsSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { COMMANDS, FILES } from '@/config/constants';

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

export interface CheckoutResult {
  ok: boolean;
  command: typeof COMMANDS.CHECKOUT;
  alias: string;
  target: string;
  changes: CheckoutChange[];
  changed: number;
  unchanged: number;
  error?: string;
}

export interface CheckoutTarget {
  type: 'original' | 'local' | 'remote';
  baseUrl: string;
}

export interface CheckoutDeps {
  alias: string;
  manifest?: MirrorManifest;
  /** Snapshot dependencies (name + sha256 + urls) used to match manifest entries. */
  dependencies: Array<{ name: string; sha256: string | null; urls: string[] }>;
  resolveTarget: (alias: string) => Promise<CheckoutTarget>;
  readFiles: () => Promise<Record<string, string>>;
  rewriteFile: (path: string, content: string, before: string, after: string) => Promise<boolean>;
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

    for (const dep of deps.dependencies) {
      if (!dep.sha256) continue;
      const entry = manifest.objects[dep.sha256];
      if (!entry) {
        unchanged++;
        continue;
      }

      const originalUrl = entry.sources[0];
      const targetUrl = target.type === 'original' ? originalUrl : `${target.baseUrl}/${entry.path}`;

      let found = false;
      for (const [filePath, content] of Object.entries(files)) {
        const currentUrl = findDependencyUrl(content, dep.name);
        if (currentUrl === null) continue;
        found = true;

        if (currentUrl === targetUrl) {
          unchanged++;
          continue;
        }

        const { changed, newContent } = replaceDependencyUrl(content, dep.name, targetUrl);
        if (changed) {
          const written = await deps.rewriteFile(filePath, newContent, currentUrl, targetUrl);
          if (written) {
            changes.push({ file: filePath, dependency: dep.name, before: currentUrl, after: targetUrl });
          }
        } else {
          unchanged++;
        }
      }
      if (!found) unchanged++;
    }
  } else {
    // Local target: iterate over snapshot dependencies directly.
    for (const dep of deps.dependencies) {
      const currentUrl = dep.urls[0];
      if (!currentUrl) continue;
      const fileName = currentUrl.replace(/\/$/, '').split('/').pop() || 'object';
      const targetUrl = `${target.baseUrl}/${fileName}`;

      let found = false;
      for (const [filePath, content] of Object.entries(files)) {
        const currentInFile = findDependencyUrl(content, dep.name);
        if (currentInFile === null) continue;
        found = true;

        if (currentInFile === targetUrl) {
          unchanged++;
          continue;
        }

        const { changed, newContent } = replaceDependencyUrl(content, dep.name, targetUrl);
        if (changed) {
          const written = await deps.rewriteFile(filePath, newContent, currentInFile, targetUrl);
          if (written) {
            changes.push({ file: filePath, dependency: dep.name, before: currentInFile, after: targetUrl });
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

