import type { MirrorManifest } from '@/mirror/models';
import { resolveAlias, RESERVED_ALIASES } from '@/mirror/alias';
import { existsSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { COMMANDS, ARCHIVE_SUFFIXES, FILES } from '@/config/constants';

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

