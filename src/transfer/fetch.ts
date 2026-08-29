import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { Dependency } from '@/inspect/models';
import { ObjectsStore } from '@/objects/store';
import { downloadAndStore } from '@/objects/download';
import { isSha256Hex } from '@/objects/sha256';
import type {
  FetchSummary,
  PerDependencyResult,
} from '@/objects/models';

export class MissingSnapshotError extends Error {
  constructor(snapshotPath: string) {
    super(`no dependency snapshot, run "bazel-git-lfs inspect" first (expected ${snapshotPath})`);
    this.name = 'MissingSnapshotError';
  }
}

export interface FetchCommandResult {
  ok: boolean;
  command: 'fetch';
  projectDir: string;
  objectsDir: string;
  results: PerDependencyResult[];
  warnings: string[];
  summary: FetchSummary;
  error?: string;
}

/**
 * Fetch orchestration (US1): read the persisted snapshot and download every
 * dependency from its declared origin URLs into the local objects store,
 * verifying SHA256 before anything is stored (FR-001..FR-006).
 */
export async function runFetch(projectDir: string): Promise<FetchCommandResult> {
  const objectsDir = join(projectDir, CONFIG_DIR_NAME, 'objects');
  const store = ObjectsStore.forProject(projectDir);
  const snapshot = new FsSnapshotStore();
  const snapshotPath = snapshot.snapshotPath(projectDir);

  if (!existsSync(snapshotPath)) {
    throw new MissingSnapshotError(snapshotPath);
  }

  const inspect = await snapshot.read(projectDir);
  const dependencies = inspect.dependencies;
  const warnings: string[] = [];

  const results: PerDependencyResult[] = [];
  for (const dependency of dependencies) {
    results.push(await fetchDependency(store, dependency, warnings));
  }

  const summary: FetchSummary = {
    total: results.length,
    fetched: count(results, 'fetched'),
    cached: count(results, 'cached'),
    failed: count(results, 'failed'),
  };
  const failed = summary.failed;
  return {
    ok: failed === 0,
    command: 'fetch',
    projectDir,
    objectsDir,
    results,
    warnings,
    summary,
    ...(failed > 0 ? { error: `${failed} dependency failed during fetch` } : {}),
  };
}

async function fetchDependency(
  store: ObjectsStore,
  dependency: Dependency,
  warnings: string[],
): Promise<PerDependencyResult> {
  const base: PerDependencyResult = {
    name: dependency.name,
    sha256: dependency.sha256,
    status: 'failed',
  };

  if (!dependency.sha256 || !isSha256Hex(dependency.sha256)) {
    return {
      ...base,
      reason: 'missing-sha256',
      message: dependency.sha256
        ? `declared sha256 "${dependency.sha256}" is not a 64-char hex digest`
        : 'dependency declares no sha256; refusing to download unverified content',
    };
  }

  let ref;
  try {
    ref = store.pathFor(dependency.urls[0] ?? '', dependency.sha256);
  } catch (err) {
    return { ...base, reason: 'store-error', message: (err as Error).message };
  }
  if (ref.fallback && ref.warning) {
    warnings.push(`${dependency.name}: ${ref.warning}`);
  }

  if (dependency.urls.length === 0) {
    return { ...base, reason: 'no-url-succeeded', message: 'dependency declares no source URLs' };
  }

  if (await store.has(ref)) {
    return { ...base, status: 'cached' };
  }

  const outcome = await downloadAndStore(store, dependency.urls, ref);
  if (outcome.status === 'fetched') {
    return { ...base, status: 'fetched', path: ref.relativePath };
  }
  return {
    ...base,
    reason: outcome.reason,
    message: outcome.message,
  };
}

function count(results: PerDependencyResult[], status: string): number {
  return results.filter((r) => r.status === status).length;
}
