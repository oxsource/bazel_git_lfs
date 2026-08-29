import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createTestMirror, gitLfsAvailable, type TestMirror } from '../helpers/test-mirror';
import { startOriginServer, fixtureRoutes, type OriginServer } from '../helpers/origin-server';
import { runFetch } from '@/transfer/fetch';
import { runPush } from '@/transfer/push';
import { runPull } from '@/transfer/pull';
import { ObjectsStore } from '@/objects/store';
import { sha256 } from '@/objects/sha256';
import { FsProfileStore } from '@/config/store';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { Dependency } from '@/inspect/models';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/artifacts');
const lfs = gitLfsAvailable();
const cleanup: string[] = [];
let mirror: TestMirror;
let origin: OriginServer;
let originRequestsAtStart = 0;
let projectA: string;

const ALPHA = readFileSync(join(FIXTURES, 'alpha.bin'));
const ALPHA_SHA = sha256.hexOfBuffer(ALPHA);
const BETA = readFileSync(join(FIXTURES, 'beta.bin'));
const BETA_SHA = sha256.hexOfBuffer(BETA);
const ALPHA_URL = 'https://github.com/facebook/react/react.tar.gz';

function dep(name: string, urls: string[], sha256: string | null): Dependency {
  return { name, urls, sha256, stripPrefix: null, sourceFile: 'WORKSPACE', resolved: true };
}

async function prepareProject(
  deps: Dependency[],
  opts: { populate?: boolean; profile?: boolean } = {},
): Promise<string> {
  const projectDir = mkdtempSync(join(tmpdir(), 'bgl-rt-'));
  cleanup.push(projectDir);
  const configDir = join(projectDir, '.bazel_git_lfs');
  mkdirSync(configDir, { recursive: true });

  if (opts.profile ?? true) {
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

  if (opts.populate) {
    const store = ObjectsStore.forProject(projectDir);
    await store.put(store.pathFor(ALPHA_URL, ALPHA_SHA), ALPHA);
    await store.put(store.pathFor('https://example.com/beta.tar.gz', BETA_SHA), BETA);
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

describe.skipIf(!lfs)('full round trip: fetch+push (A) → pull (B), mirror-only', () => {
  beforeAll(async () => {
    mirror = createTestMirror();
    origin = await startOriginServer(FIXTURES, {
      '/deep/react/v1.2/react.tar.gz': { file: 'alpha.bin' },
      '/beta.tar.gz': { file: 'beta.bin' },
      ...fixtureRoutes({ '/react.tar.gz': 'alpha.bin' }),
    });
  });

  afterAll(async () => {
    await origin.close();
    mirror?.close();
    for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  });

  it('project A: fetch from origin then push populates the mirror', { timeout: 120_000 }, async () => {
    projectA = await prepareProject(
      [
        dep('react', [`${origin.url}/deep/react/v1.2/react.tar.gz`], ALPHA_SHA),
        dep('beta', [`${origin.url}/beta.tar.gz`], BETA_SHA),
      ],
      { profile: false }, // fetch needs no profile; push called with explicit remote
    );

    const fetched = await runFetch(projectA);
    expect(fetched.ok).toBe(true);
    expect(fetched.summary.fetched).toBe(2);

    originRequestsAtStart = origin.totalRequests();

    const pushed = await runPush(projectA, {
      remote: { alias: 'default', url: mirror.barePath },
    });
    expect(pushed.ok).toBe(true);
    expect(pushed.summary.uploaded).toBe(2);
    expect(pushed.commit).toBeTruthy();
  });

  it('project B: pull reproduces a byte-identical store with zero origin requests', { timeout: 120_000 }, async () => {
    const deps = [
      dep('react', [`${origin.url}/deep/react/v1.2/react.tar.gz`], ALPHA_SHA),
      dep('beta', [`${origin.url}/beta.tar.gz`], BETA_SHA),
    ];
    // B uses the same snapshot content as A.
    const projectB = await prepareProject(deps, { profile: true });
    const storeA = ObjectsStore.forProject(projectA);

    const result = await runPull(projectB, {
      remote: { alias: 'default', url: mirror.barePath },
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({
      total: 2, pulled: 2, cached: 0, 'not-in-mirror': 0, failed: 0,
    });

    // byte-identical local store (SC-003)
    const storeB = ObjectsStore.forProject(projectB);
    for (const [url, sha] of [
      [`${origin.url}/deep/react/v1.2/react.tar.gz`, ALPHA_SHA],
      [`${origin.url}/beta.tar.gz`, BETA_SHA],
    ] as const) {
      const refA = storeA.pathFor(url, sha);
      const refB = storeB.pathFor(url, sha);
      expect(existsSync(refB.absolutePath)).toBe(true);
      expect(readFileSync(refB.absolutePath)).toEqual(readFileSync(refA.absolutePath));
    }

    // zero origin requests during pull (SC-003: mirror-only)
    expect(origin.totalRequests()).toBe(originRequestsAtStart);

    // re-pull → all cached, no transfer
    const again = await runPull(projectB, {
      remote: { alias: 'default', url: mirror.barePath },
    });
    expect(again.summary.cached).toBe(2);
    expect(again.summary.pulled).toBe(0);
    expect(origin.totalRequests()).toBe(originRequestsAtStart);
  });

  it('project B: dependency missing from the mirror → not-in-mirror, exit non-zero', { timeout: 120_000 }, async () => {
    const project = await prepareProject(
      [dep('ghost', ['https://nowhere.invalid/x.tar.gz'], 'c'.repeat(64))],
      { profile: true },
    );

    const result = await runPull(project, {
      remote: { alias: 'default', url: mirror.barePath },
    });

    expect(result.ok).toBe(false);
    expect(result.summary['not-in-mirror']).toBe(1);
    expect(result.results[0].message).toMatch(/an upstream project must push it/);
  });
});
