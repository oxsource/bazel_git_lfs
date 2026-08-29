import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { Dependency } from '@/inspect/models';
import { ObjectsStore, HashMismatchError } from '@/objects/store';
import { sha256 } from '@/objects/sha256';
import type { ObjectRef } from '@/objects/models';
import type { MirrorManifest, RemoteInfo } from '@/mirror/models';
import { GitError } from '@/mirror/lfs';
import type { ArtifactRepository } from '@/mirror/repository';
import { GitLfsRepository } from '@/mirror/repository';
import type { PerDependencyResult, PullSummary } from '@/objects/models';
import { MissingSnapshotError } from '@/transfer/fetch';
import { COMMANDS } from '@/config/constants';

export interface PullCommandResult {
  ok: boolean;
  command: typeof COMMANDS.PULL;
  projectDir: string;
  objectsDir: string;
  remote: RemoteInfo;
  results: PerDependencyResult[];
  warnings: string[];
  summary: PullSummary;
  error?: string;
}

export interface PullOptions {
  remote: RemoteInfo;
  /** Test seam: inject a repository implementation (defaults to GitLfs). */
  repository?: ArtifactRepository;
}

interface Wanted {
  name: string;
  /** Manifest-recorded mirror-relative object path. */
  relPath: string;
  sha256: string;
}

/**
 * Pull orchestration (US3): mirror-only transfer. Snapshot dependencies are
 * resolved against the mirror manifest, materialized via `git lfs pull
 * --include`, SHA256-verified on arrival, and stored into the local objects
 * store. Origin URLs are never contacted (FR-010); mirror-missing
 * dependencies fail with `not-in-mirror` (FR-011).
 */
export async function runPull(
  projectDir: string,
  opts: PullOptions,
): Promise<PullCommandResult> {
  const store = ObjectsStore.forProject(projectDir);
  const snapshot = new FsSnapshotStore();
  const snapshotPath = snapshot.snapshotPath(projectDir);
  if (!existsSync(snapshotPath)) {
    throw new MissingSnapshotError(snapshotPath);
  }

  const inspect = await snapshot.read(projectDir);
  const warnings: string[] = [];
  const repository = opts.repository ?? new GitLfsRepository(projectDir, opts.remote.url);

  await repository.ensureWorkingClone();
  const read = await repository.readManifest();
  if (read.warning && read.objectsPresent) {
    // Same inventory rule as push: never assume an empty mirror silently.
    throw new Error(`mirror inventory problem: ${read.warning}`);
  }
  const manifest = read.manifest;

  const results: PerDependencyResult[] = [];
  const wanted: Wanted[] = [];

  for (const dependency of inspect.dependencies) {
    const outcome = await resolveDependency(store, manifest, dependency, warnings);
    results.push(outcome.result);
    if (outcome.wanted) {
      wanted.push({ name: dependency.name, relPath: outcome.wanted, sha256: dependency.sha256 ?? '' });
    }
  }

  let transferError: string | undefined;
  if (wanted.length > 0) {
    transferError = await materializeAndStore(store, wanted, results, repository);
  }

  const summary = summarize(results);
  const ok = summary.failed === 0 && summary['not-in-mirror'] === 0;
  return {
    ok,
    command: COMMANDS.PULL,
    projectDir,
    objectsDir: store.objectsDir,
    remote: opts.remote,
    results,
    warnings,
    summary,
    ...(ok ? {} : { error: transferError ?? pullError(summary) }),
  };
}

/** Returns an error message when materialization failed (git-level). */
async function materializeAndStore(
  store: ObjectsStore,
  wanted: Wanted[],
  results: PerDependencyResult[],
  repository: ArtifactRepository,
): Promise<string | undefined> {
  let materialized: string[];
  try {
    materialized = await repository.materialize(wanted.map((w) => w.relPath));
  } catch (err) {
    const message = err instanceof GitError ? err.message : (err as Error).message;
    for (const w of wanted) {
      const result = results.find((r) => r.name === w.name);
      if (result) {
        result.status = 'failed';
        result.reason = 'git-error';
        result.message = message;
      }
    }
    return message;
  }

  for (let i = 0; i < wanted.length; i += 1) {
    const w = wanted[i];
    const result = results.find((r) => r.name === w.name);
    if (!result) continue;
    try {
      const actual = await sha256.hexOfFile(materialized[i]);
      if (actual !== w.sha256) {
        throw new HashMismatchError(
          `mirror object does not match declared sha256 (expected ${w.sha256}, got ${actual})`,
          w.sha256,
          actual,
        );
      }
      const ref = refForRelativePath(store, w.relPath, w.sha256);
      await store.putFromFile(ref, materialized[i]);
      result.status = 'pulled';
      result.path = w.relPath;
    } catch (err) {
      result.status = 'failed';
      result.reason = err instanceof HashMismatchError ? 'hash-mismatch' : 'store-error';
      result.message = (err as Error).message;
    }
  }
  return undefined;
}

function refForRelativePath(store: ObjectsStore, relPath: string, sha256: string): ObjectRef {
  return {
    url: '',
    sha256,
    relativePath: relPath,
    absolutePath: join(store.objectsDir, relPath),
    fallback: false,
  };
}

interface Outcome {
  result: PerDependencyResult;
  wanted?: string;
}

async function resolveDependency(
  store: ObjectsStore,
  manifest: MirrorManifest,
  dependency: Dependency,
  warnings: string[],
): Promise<Outcome> {
  const base: PerDependencyResult = {
    name: dependency.name,
    sha256: dependency.sha256,
    status: 'failed',
  };

  if (!dependency.sha256 || !sha256.isHex(dependency.sha256)) {
    return {
      result: {
        ...base,
        reason: 'missing-sha256',
        message: 'dependency has no valid sha256; cannot resolve it in the mirror',
      },
    };
  }

  let ref;
  try {
    ref = store.pathFor(dependency.urls[0] ?? '', dependency.sha256);
  } catch (err) {
    return { result: { ...base, reason: 'store-error', message: (err as Error).message } };
  }
  if (ref.fallback && ref.warning) {
    warnings.push(`${dependency.name}: ${ref.warning}`);
  }

  if (await store.has(ref)) {
    return { result: { ...base, status: 'cached' } };
  }

  const entry = manifest.objects[dependency.sha256];
  if (!entry) {
    return {
      result: {
        ...base,
        status: 'not-in-mirror',
        reason: 'not-in-mirror',
        message: `mirror lacks object ${dependency.sha256}; an upstream project must push it`,
      },
    };
  }

  return { result: { ...base, status: 'failed' }, wanted: entry.path };
}

function summarize(results: PerDependencyResult[]): PullSummary {
  return {
    total: results.length,
    pulled: count(results, 'pulled'),
    cached: count(results, 'cached'),
    'not-in-mirror': count(results, 'not-in-mirror'),
    failed: count(results, 'failed'),
  };
}

function count(results: PerDependencyResult[], status: string): number {
  return results.filter((r) => r.status === status).length;
}

function pullError(summary: PullSummary): string {
  if (summary.failed > 0) {
    return `${summary.failed} dependency failed during pull`;
  }
  return `${summary['not-in-mirror']} dependency not found in the mirror`;
}

export { GitError, MissingSnapshotError };
