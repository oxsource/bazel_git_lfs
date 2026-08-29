import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir as osTmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startOriginServer, fixtureRoutes, type OriginServer } from '../helpers/origin-server';
import { runFetch } from '@/transfer/fetch';
import { runFetchCommand } from '@/cli/fetch';
import { ObjectsStore } from '@/objects/store';
import { sha256 } from '@/objects/sha256';
import { FsSnapshotStore } from '@/inspect/snapshot';
import type { Dependency } from '@/inspect/models';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/artifacts');
const ALPHA = readFileSync(join(FIXTURES, 'alpha.bin'));
const ALPHA_SHA = sha256.hexOfBuffer(ALPHA);
const BETA_SHA = sha256.hexOfBuffer(readFileSync(join(FIXTURES, 'beta.bin')));

let origin: OriginServer;

beforeAll(async () => {
  origin = await startOriginServer(FIXTURES, {
    '/deep/react/v1.2/x.tar.gz': { file: 'alpha.bin' },
    '/beta.tar.gz': { file: 'beta.bin' },
    '/corrupt/x.tar.gz': { file: 'alpha-corrupt.bin' },
    ...fixtureRoutes({ '/alpha.bin': 'alpha.bin' }),
  });
});

afterAll(async () => {
  await origin.close();
});

const projects: string[] = [];

function tempProjectDir(): string {
  const dir = mkdtempSync(join(osTmpdir(), 'bgl-fetch-'));
  projects.push(dir);
  return dir;
}

function makeProject(deps: Dependency[]): string {
  const projectDir = tempProjectDir();
  mkdirSync(join(projectDir, '.bazel_git_lfs'), { recursive: true });
  writeSnapshot(projectDir, deps);
  return projectDir;
}

function dep(name: string, urls: string[], sha256: string | null): Dependency {
  return { name, urls, sha256, stripPrefix: null, sourceFile: 'WORKSPACE', resolved: true };
}

function writeSnapshot(projectDir: string, deps: Dependency[]): void {
  const store = new FsSnapshotStore();
  const snapshot = {
    projectDir,
    dependencies: deps,
    warnings: [],
    filesScanned: [],
    queryUsed: false,
    queryExternalRepos: null,
    dependencyRelations: null,
  };
  writeFileSync(store.snapshotPath(projectDir), JSON.stringify(snapshot, null, 2) + '\n');
}

afterAll(() => {
  for (const project of projects) {
    rmSync(project, { recursive: true, force: true });
  }
});

describe('fetch (US1) end-to-end', () => {
  it('downloads and verifies all dependencies to their derived paths', async () => {
    const before = origin.hits('/deep/react/v1.2/x.tar.gz');
    const project = makeProject([
      dep('react', [`${origin.url}/deep/react/v1.2/x.tar.gz`], ALPHA_SHA),
      dep('beta', [`${origin.url}/beta.tar.gz`], BETA_SHA),
    ]);
    const result = await runFetch(project);

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ total: 2, fetched: 2, cached: 0, failed: 0 });

    const store = ObjectsStore.forProject(project);
    const refA = store.pathFor(`${origin.url}/deep/react/v1.2/x.tar.gz`, ALPHA_SHA);
    // origin host is an IP literal → deterministic fallback bucket
    expect(refA.fallback).toBe(true);
    expect(existsSync(refA.absolutePath)).toBe(true);
    const refB = store.pathFor(`${origin.url}/beta.tar.gz`, BETA_SHA);
    expect(existsSync(refB.absolutePath)).toBe(true);
    expect(origin.hits('/deep/react/v1.2/x.tar.gz')).toBe(before + 1);
  });

  it('reuses valid cache entries without network, refetches corrupt ones', async () => {
    const project = makeProject([
      dep('react', [`${origin.url}/deep/react/v1.2/x.tar.gz`], ALPHA_SHA),
    ]);
    await runFetch(project);
    const hitsBefore = origin.hits('/deep/react/v1.2/x.tar.gz');

    const cached = await runFetch(project);
    expect(cached.summary.cached).toBe(1);
    expect(cached.summary.fetched).toBe(0);
    expect(origin.hits('/deep/react/v1.2/x.tar.gz')).toBe(hitsBefore);

    // corrupt the local entry → treated as absent, re-downloaded
    const store = ObjectsStore.forProject(project);
    const ref = store.pathFor(`${origin.url}/deep/react/v1.2/x.tar.gz`, ALPHA_SHA);
    writeFileSync(ref.absolutePath, 'corrupted');
    const refetched = await runFetch(project);
    expect(refetched.summary.fetched).toBe(1);
    expect(origin.hits('/deep/react/v1.2/x.tar.gz')).toBe(hitsBefore + 1);
    expect(await store.has(ref)).toBe(true);
  });

  it('rejects hash-mismatched artifacts and stores nothing (G1)', async () => {
    const project = makeProject([dep('bad', [`${origin.url}/corrupt/x.tar.gz`], ALPHA_SHA)]);
    const result = await runFetch(project);

    expect(result.ok).toBe(false);
    expect(result.summary.failed).toBe(1);
    const bad = result.results[0];
    expect(bad.status).toBe('failed');
    expect(bad.reason).toBe('hash-mismatch');
    const store = ObjectsStore.forProject(project);
    const ref = store.pathFor(`${origin.url}/corrupt/x.tar.gz`, ALPHA_SHA);
    expect(existsSync(ref.absolutePath)).toBe(false);
  });

  it('falls back across a failing URL to a working one', async () => {
    const before = origin.hits('/deep/react/v1.2/x.tar.gz');
    const project = makeProject([
      dep('react', [`${origin.url}/missing.tar.gz`, `${origin.url}/deep/react/v1.2/x.tar.gz`], ALPHA_SHA),
    ]);
    const result = await runFetch(project);
    expect(result.ok).toBe(true);
    expect(result.summary.fetched).toBe(1);
    expect(origin.hits('/deep/react/v1.2/x.tar.gz')).toBe(before + 1);
  });

  it('deduplicates identical content from different URLs into one stored object', async () => {
    const project = makeProject([
      dep('alpha-a', [`${origin.url}/alpha.bin`], ALPHA_SHA),
      dep('alpha-b', [`${origin.url}/deep/react/v1.2/x.tar.gz`], ALPHA_SHA),
    ]);
    const result = await runFetch(project);
    // second dep with the same SHA256 is already in the store → cached
    expect(result.summary).toEqual({ total: 2, fetched: 1, cached: 1, failed: 0 });
    expect(await ObjectsStore.forProject(project).size()).toBe(1);
  });

  it('rejects dependencies without a sha256 without any origin request', async () => {
    const before = origin.hits('/alpha.bin');
    const project = makeProject([dep('nosum', [`${origin.url}/alpha.bin`], null)]);
    const result = await runFetch(project);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('missing-sha256');
    expect(origin.hits('/alpha.bin')).toBe(before);
  });

  it('continues past individual failures and reports a summary', async () => {
    const project = makeProject([
      dep('bad', [`${origin.url}/corrupt/x.tar.gz`], ALPHA_SHA),
      dep('good', [`${origin.url}/beta.tar.gz`], BETA_SHA),
    ]);
    const result = await runFetch(project);
    expect(result.ok).toBe(false);
    expect(result.summary).toEqual({ total: 2, fetched: 1, cached: 0, failed: 1 });
    expect(result.error).toMatch(/1 dependency failed/);
  });

  it('throws MissingSnapshotError when no snapshot exists', async () => {
    const projectDir = tempProjectDir();
    mkdirSync(join(projectDir, '.bazel_git_lfs'), { recursive: true });
    await expect(runFetch(projectDir)).rejects.toThrow(/no dependency snapshot/);
  });

  it('CLI: exit codes follow the contract (ok→0, failure→1, uninitialized→1)', async () => {
    const okProject = makeProject([dep('beta', [`${origin.url}/beta.tar.gz`], BETA_SHA)]);
    expect(await runFetchCommand({ cwd: okProject })).toBe(0);

    const badProject = makeProject([dep('bad', [`${origin.url}/corrupt/x.tar.gz`], ALPHA_SHA)]);
    expect(await runFetchCommand({ cwd: badProject })).toBe(1);

    const uninitialized = tempProjectDir();
    expect(await runFetchCommand({ cwd: uninitialized })).toBe(1);
  });
});
