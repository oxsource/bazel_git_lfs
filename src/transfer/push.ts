import { existsSync } from 'node:fs';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { Dependency } from '@/inspect/models';
import { ObjectsStore } from '@/objects/store';
import { isSha256Hex } from '@/objects/sha256';
import { mergeManifest } from '@/mirror/manifest';
import type { MirrorManifest, RemoteInfo } from '@/mirror/models';
import { GitError } from '@/mirror/lfs';
import type { ArtifactRepository, UploadObject } from '@/mirror/repository';
import { GitLfsRepository } from '@/mirror/repository';
import type { PerDependencyResult, PushSummary } from '@/objects/models';
import { MissingSnapshotError } from '@/transfer/fetch';

export interface PushCommandResult {
  ok: boolean;
  command: 'push';
  projectDir: string;
  remote: RemoteInfo;
  /** HEAD commit of the mirror after the push; null when nothing changed. */
  commit: string | null;
  /** False when the mirror was already up to date (idempotent re-push). */
  pushed: boolean;
  results: PerDependencyResult[];
  warnings: string[];
  summary: PushSummary;
  error?: string;
}

export interface PushOptions {
  remote: RemoteInfo;
  /** Test seam: inject a repository implementation (defaults to GitLfs). */
  repository?: ArtifactRepository;
}

/**
 * Push orchestration (US2): a pure local→remote transport. Locally present,
 * verified snapshot objects are uploaded to the mirror; the manifest is
 * merged (source URLs union) and committed together with the objects
 * (FR-007, FR-008, FR-009, FR-020). Missing-local deps are reported without
 * failing the run (FR-009). Never downloads from origin.
 */
export async function runPush(
  projectDir: string,
  opts: PushOptions,
): Promise<PushCommandResult> {
  const store = ObjectsStore.forProject(projectDir);
  const snapshot = new FsSnapshotStore();
  const snapshotPath = snapshot.snapshotPath(projectDir);
  if (!existsSync(snapshotPath)) {
    throw new MissingSnapshotError(snapshotPath);
  }

  const inspect = await snapshot.read(projectDir);
  const warnings: string[] = [];
  const repository = opts.repository ?? new GitLfsRepository(projectDir, opts.remote.url);

  const current = await readManifestOrThrow(repository);

  const results: PerDependencyResult[] = [];
  const updates: Array<{ sha256: string; path: string; sources: string[] }> = [];
  const pending: Array<{ name: string; upload: UploadObject }> = [];

  for (const dependency of inspect.dependencies) {
    const entry = await classify(store, current.manifest, dependency, warnings);
    results.push(entry.result);
    if (entry.update) {
      updates.push(entry.update);
    }
    if (entry.upload) {
      pending.push({ name: dependency.name, upload: entry.upload });
    }
  }

  const merged = mergeManifest(current.manifest, updates);
  const manifestChanged = merged.updatedAt !== current.manifest.updatedAt;

  let commit: string | null = null;
  let pushed = false;

  if (pending.length > 0 || manifestChanged) {
    try {
      const outcome = await repository.upload(
        pending.map((p) => p.upload),
        merged,
        pending.length > 0
          ? `bazel-git-lfs: mirror ${pending.length} object(s)`
          : 'bazel-git-lfs: update manifest',
      );
      commit = outcome.commit;
      pushed = outcome.pushed;
      // If a GitError occurred midway the upload call throws instead —
      // reaching here means every pending object was written.
    } catch (err) {
      const message = err instanceof GitError ? err.message : (err as Error).message;
      for (const p of pending) {
        const found = results.find((r) => r.name === p.name);
        if (found && found.status === 'uploaded') {
          found.status = 'failed';
          found.reason = 'git-error';
          found.message = message;
        }
      }
      return {
        ok: false,
        command: 'push',
        projectDir,
        remote: opts.remote,
        commit: null,
        pushed: false,
        results,
        warnings,
        summary: summarize(results),
        error: message,
      };
    }
  }

  const summary = summarize(results);
  const ok = summary.failed === 0;
  return {
    ok,
    command: 'push',
    projectDir,
    remote: opts.remote,
    commit,
    pushed,
    results,
    warnings,
    summary,
    ...(summary.failed > 0 ? { error: `${summary.failed} dependency failed during push` } : {}),
  };
}

interface Classification {
  result: PerDependencyResult;
  update?: { sha256: string; path: string; sources: string[] };
  upload?: UploadObject;
}

async function classify(
  store: ObjectsStore,
  manifest: MirrorManifest,
  dependency: Dependency,
  warnings: string[],
): Promise<Classification> {
  const base: PerDependencyResult = {
    name: dependency.name,
    sha256: dependency.sha256,
    status: 'failed',
  };

  if (!dependency.sha256 || !isSha256Hex(dependency.sha256)) {
    return {
      result: {
        ...base,
        reason: 'missing-sha256',
        message: 'dependency has no valid sha256; nothing to push',
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

  const localPath = await store.get(ref); // null when absent or corrupt
  if (localPath === null) {
    return {
      result: {
        ...base,
        status: 'missing-local',
        message: 'object not present locally; run "bazel-git-lfs fetch" first',
      },
    };
  }

  const update = {
    sha256: dependency.sha256,
    path: ref.relativePath,
    sources: dependency.urls,
  };

  if (manifest.objects[dependency.sha256]) {
    // Already mirrored — record any new source URLs for the manifest merge.
    return { result: { ...base, status: 'already-mirrored' }, update };
  }

  return {
    result: { ...base, status: 'uploaded', path: ref.relativePath },
    update,
    upload: { relPath: ref.relativePath, sourcePath: localPath },
  };
}

function summarize(results: PerDependencyResult[]): PushSummary {
  return {
    total: results.length,
    uploaded: count(results, 'uploaded'),
    'already-mirrored': count(results, 'already-mirrored'),
    'missing-local': count(results, 'missing-local'),
    failed: count(results, 'failed'),
  };
}

function count(results: PerDependencyResult[], status: string): number {
  return results.filter((r) => r.status === status).length;
}

async function readManifestOrThrow(
  repository: ArtifactRepository,
): Promise<{ manifest: MirrorManifest; objectsPresent: boolean; warning?: string }> {
  const read = await repository.readManifest();
  if (read.warning && read.objectsPresent) {
    // "Objects exist but the manifest is missing/corrupt" is fatal — never
    // rebuild the inventory silently (research decision 5).
    throw new Error(`mirror inventory problem: ${read.warning}`);
  }
  return read;
}

export { GitError, MissingSnapshotError };
