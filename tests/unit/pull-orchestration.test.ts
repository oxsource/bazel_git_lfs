import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPull } from '@/transfer/pull';
import { ObjectsStore } from '@/objects/store';
import { sha256 } from '@/objects/sha256';
import { emptyManifest, mergeManifest } from '@/mirror/manifest';
import type { ArtifactRepository, ManifestReadResult } from '@/mirror/repository';
import type { MirrorManifest, RemoteInfo } from '@/mirror/models';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { Dependency } from '@/inspect/models';
import { GitError } from '@/mirror/lfs';

const ALPHA = Buffer.from('alpha-pull-bytes');
const ALPHA_SHA = sha256.hexOfBuffer(ALPHA);
const URL_A = 'https://github.com/facebook/react/a.tar.gz';
const REMOTE: RemoteInfo = { alias: 'default', url: 'file:///tmp/fake-mirror.git' };

function dep(name: string, urls: string[], sha256: string | null): Dependency {
  return { name, urls, sha256, stripPrefix: null, sourceFile: 'WORKSPACE', resolved: true };
}

async function makeProject(deps: Dependency[], objects: Array<{ url: string; bytes: Buffer }> = []): Promise<string> {
  const projectDir = mkdtempSync(join(tmpdir(), 'bgl-pull-'));
  mkdirSync(join(projectDir, '.bazel_git_lfs'), { recursive: true });
  const store = ObjectsStore.forProject(projectDir);
  for (const o of objects) {
    await store.put(store.pathFor(o.url, sha256.hexOfBuffer(o.bytes)), o.bytes);
  }
  const snapshot = {
    projectDir,
    dependencies: deps,
    warnings: [],
    filesScanned: [],
    queryUsed: false,
    queryExternalRepos: null,
    dependencyRelations: null,
  };
  writeFileSync(new FsSnapshotStore().snapshotPath(projectDir), JSON.stringify(snapshot));
  return projectDir;
}

/** Fake mirror: materialize() writes the manifest-recorded bytes to temp files. */
class FakeMirror implements ArtifactRepository {
  manifest: MirrorManifest = emptyManifest();
  objectsPresent = true;
  /** sha256 → bytes the "LFS store" holds. */
  store = new Map<string, Buffer>();
  materialized: string[] = [];
  failLfsPullWith: Error | null = null;
  calls = 0;

  async ensureWorkingClone(): Promise<void> {}

  async readManifest(): Promise<ManifestReadResult> {
    return { manifest: this.manifest, objectsPresent: this.objectsPresent };
  }

  async upload(): Promise<{ commit: string | null; pushed: boolean }> {
    throw new Error('pull never uploads');
  }

  async materialize(relPaths: string[]): Promise<string[]> {
    if (this.failLfsPullWith) throw new GitError(`git lfs pull failed: ${this.failLfsPullWith.message}`, {
      status: 1, stdout: '', stderr: this.failLfsPullWith.message,
    });
    this.materialized.push(...relPaths);
    const dir = mkdtempSync(join(tmpdir(), 'bgl-lfs-'));
    return relPaths.map((relPath, index) => {
      const sha = relPath.split('/').pop() as string;
      const bytes = this.store.get(sha);
      const target = join(dir, `${index}-${sha}`);
      writeFileSync(target, bytes ?? Buffer.from('unrelated-lfs-bytes'));
      return target;
    });
  }
}

describe('pull orchestration (US3, fake mirror)', () => {
  it('pulls a manifest hit, verifies and stores it (path from manifest)', async () => {
    const project = await makeProject([dep('react', [URL_A], ALPHA_SHA)]);
    const mirror = new FakeMirror();
    mirror.manifest = mergeManifest(mirror.manifest, [
      { sha256: ALPHA_SHA, path: `com/github/facebook/react/${ALPHA_SHA}`, sources: [URL_A] },
    ]);
    mirror.store.set(ALPHA_SHA, ALPHA);

    const result = await runPull(project, { remote: REMOTE, repository: mirror });

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({
      total: 1, pulled: 1, cached: 0, 'not-in-mirror': 0, failed: 0,
    });
    expect(result.results[0].status).toBe('pulled');
    expect(result.results[0].path).toBe(`com/github/facebook/react/${ALPHA_SHA}`);
    expect(await ObjectsStore.forProject(project).has(
      ObjectsStore.forProject(project).pathFor(URL_A, ALPHA_SHA),
    )).toBe(true);
  });

  it('reports cached without any mirror transfer when the local entry is valid', async () => {
    const project = await makeProject(
      [dep('react', [URL_A], ALPHA_SHA)],
      [{ url: URL_A, bytes: ALPHA }],
    );
    const mirror = new FakeMirror();

    const result = await runPull(project, { remote: REMOTE, repository: mirror });

    expect(result.summary.cached).toBe(1);
    expect(mirror.materialized).toHaveLength(0);
  });

  it('re-fetches a corrupt local entry from the mirror', async () => {
    const project = await makeProject([dep('react', [URL_A], ALPHA_SHA)]);
    const store = ObjectsStore.forProject(project);
    const ref = store.pathFor(URL_A, ALPHA_SHA);
    mkdirSync(dirname(ref.absolutePath), { recursive: true });
    writeFileSync(ref.absolutePath, 'corrupted-locally'); // hash-invalid

    const mirror = new FakeMirror();
    mirror.manifest = mergeManifest(mirror.manifest, [
      { sha256: ALPHA_SHA, path: `com/github/facebook/react/${ALPHA_SHA}`, sources: [URL_A] },
    ]);
    mirror.store.set(ALPHA_SHA, ALPHA);

    const result = await runPull(project, { remote: REMOTE, repository: mirror });

    expect(result.summary.pulled).toBe(1);
    expect(await store.has(ref)).toBe(true);
  });

  it('fails with not-in-mirror (strict, no origin fallback) and non-zero outcome', async () => {
    const project = await makeProject([dep('ghost', [URL_A], ALPHA_SHA)]);
    const mirror = new FakeMirror(); // empty manifest

    const result = await runPull(project, { remote: REMOTE, repository: mirror });

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('not-in-mirror');
    expect(result.results[0].message).toMatch(/an upstream project must push it/);
    expect(result.summary['not-in-mirror']).toBe(1);
  });

  it('rejects mirror objects whose bytes fail SHA256 verification (never stored)', async () => {
    const project = await makeProject([dep('react', [URL_A], ALPHA_SHA)]);
    const mirror = new FakeMirror();
    mirror.manifest = mergeManifest(mirror.manifest, [
      { sha256: ALPHA_SHA, path: `com/github/facebook/react/${ALPHA_SHA}`, sources: [URL_A] },
    ]);
    mirror.store.set(ALPHA_SHA, Buffer.from('tampered-in-transit')); // wrong bytes

    const result = await runPull(project, { remote: REMOTE, repository: mirror });

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toBe('hash-mismatch');
    const store = ObjectsStore.forProject(project);
    expect(existsSync(store.pathFor(URL_A, ALPHA_SHA).absolutePath)).toBe(false);
  });

  it('marks git-error when lfs materialization fails', async () => {
    const project = await makeProject([dep('react', [URL_A], ALPHA_SHA)]);
    const mirror = new FakeMirror();
    mirror.manifest = mergeManifest(mirror.manifest, [
      { sha256: ALPHA_SHA, path: `com/github/facebook/react/${ALPHA_SHA}`, sources: [URL_A] },
    ]);
    mirror.failLfsPullWith = new Error('lfs: authentication required');

    const result = await runPull(project, { remote: REMOTE, repository: mirror });

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('git-error');
    expect(result.error).toMatch(/authentication required/);
  });

  it('rejects missing-sha256 deps and throws when the snapshot is missing', async () => {
    const project = await makeProject([dep('nosum', [URL_A], null)]);
    const result = await runPull(project, { remote: REMOTE, repository: new FakeMirror() });
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('missing-sha256');

    const empty = mkdtempSync(join(tmpdir(), 'bgl-pull-'));
    await expect(
      runPull(empty, { remote: REMOTE, repository: new FakeMirror() }),
    ).rejects.toThrow(/no dependency snapshot/);
  });
});
