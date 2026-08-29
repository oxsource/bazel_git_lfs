import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPush } from '@/transfer/push';
import { ObjectsStore } from '@/objects/store';
import { sha256 } from '@/objects/sha256';
import { emptyManifest, mergeManifest } from '@/mirror/manifest';
import type { ArtifactRepository, ManifestReadResult, UploadObject } from '@/mirror/repository';
import type { MirrorManifest, RemoteInfo } from '@/mirror/models';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { Dependency } from '@/inspect/models';

const ALPHA = Buffer.from('alpha-object-bytes');
const ALPHA_SHA = sha256.hexOfBuffer(ALPHA);
const BETA_SHA = sha256.hexOfBuffer(Buffer.from('beta-object-bytes'));
const URL_A = 'https://github.com/facebook/react/a.tar.gz';
const URL_B = 'https://github.com/facebook/react/b.tar.gz';
const REMOTE: RemoteInfo = { alias: 'default', url: 'file:///tmp/fake-mirror.git' };

function dep(name: string, urls: string[], sha256: string | null): Dependency {
  return { name, urls, sha256, stripPrefix: null, sourceFile: 'WORKSPACE', resolved: true };
}

async function seedProject(
  deps: Dependency[],
  objects: Array<{ url: string; sha: string; bytes: Buffer }> = [],
): Promise<string> {
  const projectDir = mkdtempSync(join(tmpdir(), 'bgl-push-'));
  mkdirSync(join(projectDir, '.bazel_git_lfs'), { recursive: true });
  const store = ObjectsStore.forProject(projectDir);
  for (const o of objects) {
    await store.put(store.pathFor(o.url, o.sha), o.bytes);
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

class FakeRepository implements ArtifactRepository {
  manifest: MirrorManifest = emptyManifest();
  objectsPresent = false;
  uploaded: UploadObject[] = [];
  lastManifest: MirrorManifest | null = null;
  failUploadWith: Error | null = null;
  commit = 'feedface';

  async ensureWorkingClone(): Promise<void> {}

  async readManifest(): Promise<ManifestReadResult> {
    return { manifest: this.manifest, objectsPresent: this.objectsPresent };
  }

  async upload(
    objects: UploadObject[],
    manifest: MirrorManifest,
  ): Promise<{ commit: string | null; pushed: boolean }> {
    if (this.failUploadWith) throw this.failUploadWith;
    this.uploaded.push(...objects);
    this.lastManifest = manifest;
    this.objectsPresent = true;
    return { commit: 'feedface', pushed: true };
  }

  async materialize(relPaths: string[]): Promise<string[]> {
    void relPaths;
    return [];
  }
}

describe('push orchestration (US2, fake repository)', () => {
  it('uploads locally present objects and merges the manifest', async () => {
    const project = await seedProject(
      [dep('react', [URL_A], ALPHA_SHA)],
      [{ url: URL_A, sha: ALPHA_SHA, bytes: ALPHA }],
    );
    const repo = new FakeRepository();
    const result = await runPush(project, { remote: REMOTE, repository: repo });

    expect(result.ok).toBe(true);
    expect(result.pushed).toBe(true);
    expect(result.commit).toBe('feedface');
    expect(result.summary).toEqual({
      total: 1,
      uploaded: 1,
      'already-mirrored': 0,
      'missing-local': 0,
      failed: 0,
    });
    expect(repo.uploaded).toHaveLength(1);
    expect(repo.uploaded[0].relPath).toBe(`com/github/facebook/react/${ALPHA_SHA}`);
    expect(repo.lastManifest?.objects[ALPHA_SHA].sources).toEqual([URL_A]);
    expect(result.results[0].path).toBe(`com/github/facebook/react/${ALPHA_SHA}`);
  });

  it('is idempotent: already-mirrored with unchanged manifest → no transfer', async () => {
    const project = await seedProject(
      [dep('react', [URL_A], ALPHA_SHA)],
      [{ url: URL_A, sha: ALPHA_SHA, bytes: ALPHA }],
    );
    const repo = new FakeRepository();
    repo.manifest = mergeManifest(repo.manifest, [
      { sha256: ALPHA_SHA, path: `com/github/facebook/react/${ALPHA_SHA}`, sources: [URL_A] },
    ]);

    const result = await runPush(project, { remote: REMOTE, repository: repo });
    expect(result.ok).toBe(true);
    expect(result.pushed).toBe(false);
    expect(result.commit).toBeNull();
    expect(result.summary).toEqual({
      total: 1,
      uploaded: 0,
      'already-mirrored': 1,
      'missing-local': 0,
      failed: 0,
    });
    expect(repo.uploaded).toHaveLength(0);
  });

  it('merges new source URLs for already-mirrored content (manifest-only commit)', async () => {
    const project = await seedProject(
      [dep('react', [URL_B], ALPHA_SHA)], // different URL, same content
      [{ url: URL_B, sha: ALPHA_SHA, bytes: ALPHA }],
    );
    const repo = new FakeRepository();
    repo.manifest = mergeManifest(repo.manifest, [
      { sha256: ALPHA_SHA, path: `com/github/facebook/react/${ALPHA_SHA}`, sources: [URL_A] },
    ]);

    const result = await runPush(project, { remote: REMOTE, repository: repo });

    expect(result.ok).toBe(true);
    expect(result.summary['already-mirrored']).toBe(1);
    expect(repo.uploaded).toHaveLength(0); // object not re-uploaded (FR-014)
    expect(repo.lastManifest?.objects[ALPHA_SHA].sources).toEqual([URL_A, URL_B]);
  });

  it('reports missing-local without failing the push (FR-009)', async () => {
    const project = await seedProject(
      [dep('present', [URL_A], ALPHA_SHA), dep('absent', [URL_B], BETA_SHA)],
      [{ url: URL_A, sha: ALPHA_SHA, bytes: ALPHA }],
    );
    const repo = new FakeRepository();

    const result = await runPush(project, { remote: REMOTE, repository: repo });

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({
      total: 2,
      uploaded: 1,
      'already-mirrored': 0,
      'missing-local': 1,
      failed: 0,
    });
    expect(result.results.find((r) => r.name === 'absent')?.message).toMatch(
      /run "bazel-git-lfs fetch"/,
    );
  });

  it('fails with git-error when the repository upload throws', async () => {
    const project = await seedProject(
      [dep('react', [URL_A], ALPHA_SHA)],
      [{ url: URL_A, sha: ALPHA_SHA, bytes: ALPHA }],
    );
    const repo = new FakeRepository();
    repo.failUploadWith = new Error('git push failed (re-run push to retry): non-fast-forward');

    const result = await runPush(project, { remote: REMOTE, repository: repo });

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].reason).toBe('git-error');
    expect(result.error).toMatch(/non-fast-forward/);
  });

  it('rejects missing-sha256 deps at classification time', async () => {
    const project = await seedProject([dep('nosum', [URL_A], null)], []);
    const repo = new FakeRepository();
    const result = await runPush(project, { remote: REMOTE, repository: repo });
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('missing-sha256');
  });

  it('aborts when the mirror has objects but no manifest (never rebuild silently)', async () => {
    const project = await seedProject(
      [dep('react', [URL_A], ALPHA_SHA)],
      [{ url: URL_A, sha: ALPHA_SHA, bytes: ALPHA }],
    );
    const repo = new FakeRepository();
    (repo as unknown as { readManifest: () => Promise<ManifestReadResult> }).readManifest =
      async () => ({
        manifest: emptyManifest(),
        objectsPresent: true,
        warning: 'mirror contains objects but has no manifest.json',
      });

    await expect(
      runPush(project, { remote: REMOTE, repository: repo }),
    ).rejects.toThrow(/mirror inventory problem/);
  });

  it('throws MissingSnapshotError when the snapshot is missing', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'bgl-push-'));
    await expect(
      runPush(projectDir, { remote: REMOTE, repository: new FakeRepository() }),
    ).rejects.toThrow(/no dependency snapshot/);
  });
});
