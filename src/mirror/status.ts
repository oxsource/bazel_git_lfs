import type { MirrorManifest, ManifestEntry } from '@/mirror/models';
import { COMMANDS } from '@/config/constants';

export interface StatusResult {
  sha256: string;
  path: string;
  status: 'valid' | 'corrupt' | 'missing';
  expected?: string;
  actual?: string;
  message?: string;
}

export interface StatusFilters {
  sha256Prefix?: string;
  sourceUrl?: string;
  keyword?: string;
}

export interface StatusSummary {
  total: number;
  valid: number;
  corrupt: number;
  missing: number;
}

export interface StatusOutput {
  ok: boolean;
  command: typeof COMMANDS.STATUS;
  results: StatusResult[];
  summary: StatusSummary;
  filters: StatusFilters | null;
  error?: string;
}

export interface StatusDeps {
  materialize: (relPaths: string[]) => Promise<string[]>;
  sha256HexOfFile: (filePath: string) => Promise<string>;
}

const ARCHIVE_EXTS = ['.tar.gz', '.tgz', '.tar.bz2', '.tar.xz', '.zip', '.tar'];

function deriveName(sourceUrl: string): string {
  let name = sourceUrl.replace(/\/$/, '').split('/').pop() || '';
  for (const ext of ARCHIVE_EXTS) {
    if (name.endsWith(ext)) {
      name = name.slice(0, -ext.length);
      break;
    }
  }
  return name;
}

function matchesFilters(
  sha256: string,
  entry: ManifestEntry,
  filters?: StatusFilters,
): boolean {
  if (!filters) return true;
  const { sha256Prefix, sourceUrl, keyword } = filters;

  if (sha256Prefix && !sha256.toLowerCase().startsWith(sha256Prefix.toLowerCase())) {
    return false;
  }

  if (sourceUrl) {
    const q = sourceUrl.toLowerCase();
    if (!entry.sources.some((s) => s.toLowerCase().includes(q))) {
      return false;
    }
  }

  if (keyword) {
    const kw = keyword.toLowerCase();
    const nameMatch = entry.sources.some((s) => deriveName(s).toLowerCase().includes(kw));
    const pathMatch = entry.path.toLowerCase().includes(kw);
    const urlMatch = entry.sources.some((s) => s.toLowerCase().includes(kw));
    if (!nameMatch && !pathMatch && !urlMatch) {
      return false;
    }
  }

  return true;
}

function activeFilters(filters?: StatusFilters): StatusFilters | null {
  if (!filters) return null;
  const { sha256Prefix, sourceUrl, keyword } = filters;
  if (!sha256Prefix && !sourceUrl && !keyword) return null;
  return { sha256Prefix, sourceUrl, keyword };
}

export async function runStatusScan(
  manifest: MirrorManifest,
  deps: StatusDeps,
  filters?: StatusFilters,
): Promise<StatusOutput> {
  const results: StatusResult[] = [];
  const summary: StatusSummary = { total: 0, valid: 0, corrupt: 0, missing: 0 };

  const entries = Object.entries(manifest.objects);

  const filtered = entries.filter(([sha256, entry]) => matchesFilters(sha256, entry, filters));
  summary.total = filtered.length;

  if (filtered.length > 0) {
    const relPaths = filtered.map(([, entry]) => entry.path);
    let materialized: string[];
    try {
      materialized = await deps.materialize(relPaths);
    } catch {
      for (const [sha256, entry] of filtered) {
        results.push({ sha256, path: entry.path, status: 'missing', message: 'materialization failed' });
        summary.missing++;
      }
      return {
        ok: false,
        command: COMMANDS.STATUS,
        results,
        summary,
        filters: activeFilters(filters),
        error: `${summary.missing} artifact(s) could not be materialized`,
      };
    }

    for (let i = 0; i < filtered.length; i++) {
      const [sha256, entry] = filtered[i];
      const filePath = materialized[i];

      let actual: string;
      try {
        actual = await deps.sha256HexOfFile(filePath);
      } catch {
        results.push({ sha256, path: entry.path, status: 'missing', message: 'file not found in storage' });
        summary.missing++;
        continue;
      }

      if (actual === sha256) {
        results.push({ sha256, path: entry.path, status: 'valid' });
        summary.valid++;
      } else {
        results.push({ sha256, path: entry.path, status: 'corrupt', expected: sha256, actual });
        summary.corrupt++;
      }
    }
  }

  const ok = summary.corrupt === 0 && summary.missing === 0;
  const error = ok ? undefined : `${summary.corrupt} corrupt, ${summary.missing} missing artifact(s) in the mirror`;

  return {
    ok,
    command: COMMANDS.STATUS,
    results,
    summary,
    filters: activeFilters(filters),
    error,
  };
}