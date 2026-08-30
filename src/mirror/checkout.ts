import type { MirrorManifest } from '@/mirror/models';
import { resolveAlias, RESERVED_ALIASES } from '@/mirror/alias';
import { existsSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { COMMANDS, FILES, LOCAL_SERVER } from '@/config/constants';

const LOCAL_SERVER_PORT = LOCAL_SERVER.PORT;

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

// A localhost URL that is NOT our local object server (port 8022) is a
// Bazel fallback/private URL and should never be treated as a mirror object
// URL. localhost:8022 is the local server and counts as a normal URL.
export function isLocalFallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false;
    const port = u.port || (u.protocol === 'http:' ? '80' : '443');
    return port !== String(LOCAL_SERVER_PORT);
  } catch {
    return false;
  }
}

// Exported for testing
export function findDependencyUrl(
  content: string,
  depName: string,
  expectedUrl?: string,
): string | null {
  const lines = content.split('\n');
  let inBlock = false;
  let inUrlsArray = false;
  let currentName = '';
  const found: string[] = [];

  for (const line of lines) {
    const nameMatch = line.match(/name\s*=\s*"([^"]+)"/);
    if (nameMatch) {
      currentName = nameMatch[1];
      inBlock = currentName === depName;
      inUrlsArray = false;
    }
    if (inBlock) {
      // Enter a urls = [ ... ] array block.
      const arrayStart = line.match(/^\s*urls?\s*=\s*\[/);
      if (arrayStart) {
        inUrlsArray = true;
        // Inline array:  urls = ["a", "b"]
        const inline = line.match(/urls?\s*=\s*\[([^\]]*)\]/);
        if (inline) {
          const items = inline[1].match(/"([^"]+)"/g) ?? [];
          for (const it of items) {
            const u = it.slice(1, -1);
            if (expectedUrl) {
              if (u === expectedUrl) return u;
            } else {
              found.push(u);
            }
          }
        }
        continue;
      }
      // Single value:  url = "https://..."
      const single = line.match(/^\s*url\s*=\s*"([^"]+)"/);
      if (single) {
        const u = single[1];
        if (expectedUrl) {
          if (u === expectedUrl) return u;
        } else {
          found.push(u);
        }
        continue;
      }
      // Inside urls = [ ... ]: each string element is a candidate URL.
      if (inUrlsArray) {
        if (/^\s*\]/.test(line)) {
          inUrlsArray = false;
          continue;
        }
        const item = line.match(/^\s*"([^"]+)"\s*,?\s*$/);
        if (item) {
          const u = item[1];
          if (expectedUrl) {
            if (u === expectedUrl) return u;
          } else {
            found.push(u);
          }
        }
        continue;
      }
      if (line.includes(')') && !line.includes('name')) {
        inBlock = false;
      }
    }
  }
  return found.length > 0
    ? (found.find((u) => !isLocalFallbackUrl(u)) ?? found[0])
    : null;
}

// Exported for testing
export function replaceDependencyUrl(
  content: string,
  depName: string,
  newUrl: string,
  expectedUrl?: string,
): { changed: boolean; newContent: string } {
  const lines = content.split('\n');
  let inBlock = false;
  let inUrlsArray = false;
  let currentName = '';
  let changed = false;

  const result: string[] = [];
  for (const line of lines) {
    const nameMatch = line.match(/name\s*=\s*"([^"]+)"/);
    if (nameMatch) {
      currentName = nameMatch[1];
      inBlock = currentName === depName;
      inUrlsArray = false;
    }

    if (!inBlock) {
      result.push(line);
      continue;
    }

    // Enter a urls = [ ... ] array block.
    const arrayStart = line.match(/^(\s*urls?\s*=\s*\[)([^\]]*)(\]\s*,?\s*)$/);
    if (arrayStart) {
      const items = arrayStart[2].match(/"([^"]+)"/g) ?? [];
      const replaced = items.map((it) => {
        const u = it.slice(1, -1);
        if (expectedUrl && u !== expectedUrl) return it;
        if (u === newUrl) return it;
        changed = true;
        return `"${newUrl}"`;
      });
      result.push(`${arrayStart[1]}${replaced.join(', ')}${arrayStart[3]}`);
      continue;
    }
    if (/^\s*urls?\s*=\s*\[/.test(line)) {
      inUrlsArray = true;
      result.push(line);
      continue;
    }
    // Single value:  url = "https://..."
    const single = line.match(/^(\s*url\s*=\s*)("([^"]+)")(.*)$/);
    if (single) {
      const before = single[3];
      if (!expectedUrl || before === expectedUrl) {
        if (before !== newUrl) {
          changed = true;
          result.push(`${single[1]}"${newUrl}"${single[4]}`);
          continue;
        }
      }
      result.push(line);
      continue;
    }
    // Inside urls = [ ... ]: replace matching array elements.
    if (inUrlsArray) {
      if (/^\s*\]/.test(line)) {
        inUrlsArray = false;
        result.push(line);
        continue;
      }
      const item = line.match(/^(\s*)"([^"]+)"(,?\s*)$/);
      if (item) {
        const before = item[2];
        if (!expectedUrl || before === expectedUrl) {
          if (before !== newUrl) {
            changed = true;
            result.push(`${item[1]}"${newUrl}"${item[3]}`);
            continue;
          }
        }
      }
      result.push(line);
      continue;
    }
    if (line.includes(')') && !line.includes('name')) {
      inBlock = false;
    }
    result.push(line);
  }

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
        // original → restore: find the current (possibly mirror) URL and
        // rewrite it back to the manifest's original source URL.
        // remote → rewrite: match the element equal to the original source
        // URL (so localhost entries in urls=[...] are left untouched).
        const currentUrl = target.type === 'original'
          ? findDependencyUrl(content, dep.name)
          : findDependencyUrl(content, dep.name, originalUrl);
        if (currentUrl === null) continue;
        found = true;

        if (currentUrl === targetUrl) {
          unchanged++;
          continue;
        }

        const { changed, newContent } = replaceDependencyUrl(content, dep.name, targetUrl, currentUrl);
        if (changed) {
          const written = await deps.rewriteFile(filePath, newContent, currentUrl, targetUrl);
          if (written) {
            changes.push({ file: filePath, dependency: dep.name, before: currentUrl, after: targetUrl });
            // Accumulate in-memory so later deps in the same file see this change.
            files[filePath] = newContent;
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
      // Prefer a non-fallback source URL as the match basis (localhost
      // except our 8022 server is the Bazel fallback and never rewritten).
      const originalUrl = dep.urls.find((u) => !isLocalFallbackUrl(u)) ?? dep.urls[0];
      if (!originalUrl) continue;
      // Use the manifest's object path (full path under objects/) when
      // available; otherwise fall back to the file name.
      let objectPath: string | undefined;
      if (dep.sha256 && manifest) {
        objectPath = manifest.objects[dep.sha256]?.path;
      }
      const targetUrl = objectPath
        ? `${target.baseUrl}/${objectPath}`
        : `${target.baseUrl}/${originalUrl.replace(/\/$/, '').split('/').pop() || 'object'}`;

      let found = false;
      for (const [filePath, content] of Object.entries(files)) {
        const currentInFile = findDependencyUrl(content, dep.name, originalUrl);
        if (currentInFile === null) continue;
        found = true;

        if (currentInFile === targetUrl) {
          unchanged++;
          continue;
        }

        const { changed, newContent } = replaceDependencyUrl(content, dep.name, targetUrl, originalUrl);
        if (changed) {
          const written = await deps.rewriteFile(filePath, newContent, currentInFile, targetUrl);
          if (written) {
            changes.push({ file: filePath, dependency: dep.name, before: currentInFile, after: targetUrl });
            // Accumulate in-memory so later deps in the same file see this change.
            files[filePath] = newContent;
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

