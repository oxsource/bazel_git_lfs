import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createTestMirror, gitLfsAvailable, type TestMirror } from '../helpers/test-mirror';
import { runPush } from '@/transfer/push';
import { runPushCommand } from '@/cli/push';
import { ObjectsStore } from '@/objects/store';
import { sha256HexOfBuffer } from '@/objects/sha256';
import { FsProfileStore } from '@/config/store';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { Dependency } from '@/inspect/models';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/artifacts');
const lfs = gitLfsAvailable();
const cleanup: string[] = [];
let mirror: TestMirror;

function dep(name: string, urls: string[], sha256: string | null): Dependency {
  return { name, urls, sha256, stripPrefix: null, sourceFile: 'WORKSPACE', resolved: true };
}

async function makeProject(
  deps: Dependency[],
  objects: Array<{ url: string; bytes: Buffer }>,
  withProfile = true,
): Promise<string> {
  const projectDir = mkdtempSync(join(tmpdir(), 'bgl-push-e2e-'));
  cleanup.push(projectDir);
  const configDir = join(projectDir, '.bazel_git_lfs');
  mkdirSync(configDir, { recursive: true });

  if (withProfile) {
    await new FsProfileStore().writeConfig(join(configDir, 'config.json'), {
      active: 'default',
      profiles: {
        default: {
          alias: 'default',
          url: mirror.barePath,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      aliases: {},
    });
  }

  const store = ObjectsStore.forProject(projectDir);
  for (const o of objects) {
    await store.put(store.pathFor(o.url, sha256HexOfBuffer(o.bytes)), o.bytes);
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

describe.skipIf(!lfs)('push (US2) end-to-end against a real git+git-lfs mirror', () => {
  afterAll(() => {
    mirror?.close();
    for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  });

  it('uploads objects + manifest, commits and pushes (first run)', async () => {
    mirror = createTestMirror();
    const alpha = readFileSync(join(FIXTURES, 'alpha.bin'));
    const beta = readFileSync(join(FIXTURES, 'beta.bin'));
    const alphaSha = sha256HexOfBuffer(alpha);
    const betaSha = sha256HexOfBuffer(beta);

    const project = await makeProject(
      [
        dep('react', ['https://github.com/facebook/react/a.tar.gz'], alphaSha),
        dep('beta', ['https://example.com/beta.tar.gz'], betaSha),
        dep('missing', ['https://github.com/facebook/react/missing.tar.gz'], betaSha), // missing-local
      ],
      [
        { url: 'https://github.com/facebook/react/a.tar.gz', bytes: alpha },
        { url: 'https://example.com/beta.tar.gz', bytes: beta },
      ],
    );

    const result = await runPush(project, {
      remote: { alias: 'default', url: mirror.barePath },
    });

    expect(result.ok).toBe(true); // missing-local alone is not a failure (FR-009)
    expect(result.pushed).toBe(true);
    expect(result.summary).toEqual({
      total: 3,
      uploaded: 2,
      'already-mirrored': 0,
      'missing-local': 1,
      failed: 0,
    });
    expect(result.commit).toBeTruthy();

    // The mirror (bare repo) now contains the objects and the manifest.
    mirror.git(['fetch', 'origin']);
    mirror.git(['reset', '--hard', 'origin/main']);
    mirror.git(['lfs', 'pull', '--include', `objects/com/github/facebook/react/${alphaSha}`]);
    const manifest = JSON.parse(mirror.readWorkFile('manifest.json'));
    expect(manifest.version).toBe(1);
    expect(manifest.objects[alphaSha].path).toBe(`com/github/facebook/react/${alphaSha}`);
    expect(manifest.objects[betaSha].path).toBe(`com/example/${betaSha}`);
    expect(mirror.readWorkFile(`objects/com/github/facebook/react/${alphaSha}`)).toBe(
      alpha.toString(),
    );
  });

  it('is idempotent on re-push (already-mirrored, no new commit)', async () => {
    const alpha = readFileSync(join(FIXTURES, 'alpha.bin'));
    const alphaSha = sha256HexOfBuffer(alpha);
    const project = await makeProject(
      [dep('react', ['https://github.com/facebook/react/a.tar.gz'], alphaSha)],
      [{ url: 'https://github.com/facebook/react/a.tar.gz', bytes: alpha }],
    );

    const first = await runPush(project, { remote: { alias: 'default', url: mirror.barePath } });
    expect(first.pushed).toBe(true);
    const commitAfterFirst = mirror.git(['rev-parse', 'origin/main']).stdout.trim();

    const second = await runPush(project, { remote: { alias: 'default', url: mirror.barePath } });
    expect(second.pushed).toBe(false);
    expect(second.commit).toBeNull();
    expect(second.summary['already-mirrored']).toBe(1);
    expect(mirror.git(['rev-parse', 'origin/main']).stdout.trim()).toBe(commitAfterFirst);
  });

  it('CLI: missing default profile → JSON error, exit 1', async () => {
    const project = await makeProject([], [], false);
    const code = await runPushCommand({ cwd: project });
    expect(code).toBe(1);
  });
});
