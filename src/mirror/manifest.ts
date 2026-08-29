import {
  MANIFEST_VERSION,
  type ManifestUpdate,
  type MirrorManifest,
} from '@/mirror/models';

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

export function emptyManifest(now = new Date().toISOString()): MirrorManifest {
  return { version: MANIFEST_VERSION, updatedAt: now, objects: {} };
}

/**
 * Parse and validate a manifest JSON string. Throws ManifestError on
 * invalid JSON or structure (callers decide empty-vs-abort per research
 * decision 5).
 */
export function parseManifest(raw: string): MirrorManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ManifestError('manifest.json is corrupted (invalid JSON)');
  }
  return validateManifest(parsed);
}

function validateManifest(parsed: unknown): MirrorManifest {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ManifestError('manifest.json has an invalid structure');
  }
  const manifest = parsed as Record<string, unknown>;
  if (manifest.version !== MANIFEST_VERSION) {
    throw new ManifestError(
      `manifest.json has unsupported version ${String(manifest.version)} (expected ${MANIFEST_VERSION})`,
    );
  }
  if (typeof manifest.updatedAt !== 'string') {
    throw new ManifestError('manifest.json is missing "updatedAt"');
  }
  if (typeof manifest.objects !== 'object' || manifest.objects === null || Array.isArray(manifest.objects)) {
    throw new ManifestError('manifest.json is missing the "objects" map');
  }

  const objects: MirrorManifest['objects'] = {};
  for (const [sha256, entry] of Object.entries(manifest.objects)) {
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new ManifestError(`manifest.json has an invalid object key "${sha256}"`);
    }
    if (typeof entry !== 'object' || entry === null) {
      throw new ManifestError(`manifest entry "${sha256}" is malformed`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== 'string' || e.path.length === 0) {
      throw new ManifestError(`manifest entry "${sha256}" is missing "path"`);
    }
    if (
      !Array.isArray(e.sources) ||
      e.sources.length === 0 ||
      !e.sources.every((s) => typeof s === 'string' && s.length > 0)
    ) {
      throw new ManifestError(`manifest entry "${sha256}" has an invalid "sources" list`);
    }
    if (typeof e.firstSeenAt !== 'string') {
      throw new ManifestError(`manifest entry "${sha256}" is missing "firstSeenAt"`);
    }
    objects[sha256] = {
      path: e.path,
      sources: [...(e.sources as string[])],
      firstSeenAt: e.firstSeenAt,
    };
  }

  return { version: MANIFEST_VERSION, updatedAt: manifest.updatedAt, objects };
}

/**
 * Merge updates into a manifest (research decision 5): an existing SHA256
 * keeps its `path`/`firstSeenAt` and unions new source URLs into `sources`
 * (dedup, order-stable, primary first); new SHA256s get fresh entries.
 * Returns a new manifest object; `updatedAt` is refreshed when anything
 * changed.
 */
export function mergeManifest(
  manifest: MirrorManifest,
  updates: ManifestUpdate[],
  now = new Date().toISOString(),
): MirrorManifest {
  const objects = { ...manifest.objects };
  let changed = false;

  for (const update of updates) {
    const existing = objects[update.sha256];
    if (existing) {
      const sources = unionSources(existing.sources, update.sources);
      if (sources !== existing.sources) {
        objects[update.sha256] = { ...existing, sources };
        changed = true;
      }
      continue;
    }
    objects[update.sha256] = {
      path: update.path,
      sources: dedupe(update.sources),
      firstSeenAt: now,
    };
    changed = true;
  }

  return {
    version: MANIFEST_VERSION,
    updatedAt: changed ? now : manifest.updatedAt,
    objects,
  };
}

function dedupe(urls: string[]): string[] {
  return [...new Set(urls)];
}

function unionSources(existing: string[], incoming: string[]): string[] {
  const merged = [...existing];
  let changed = false;
  for (const url of incoming) {
    if (!merged.includes(url)) {
      merged.push(url);
      changed = true;
    }
  }
  return changed ? merged : existing;
}

export function serializeManifest(manifest: MirrorManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
