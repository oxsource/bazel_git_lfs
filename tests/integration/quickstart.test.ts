import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildProgram } from '@/cli/index';
import { createTestMirror, gitLfsAvailable, type TestMirror } from '../helpers/test-mirror';
import { startOriginServer, fixtureRoutes, type OriginServer } from '../helpers/origin-server';
import { ObjectsStore } from '@/objects/store';
import { sha256 } from '@/objects/sha256';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/artifacts');
const lfs = gitLfsAvailable();
const cleanups: string[] = [];
let mirror: TestMirror;
let origin: OriginServer;

function cli(args: string[], cwd: string): Promise<number> {
  const program = buildProgram({ cwd });
  const originalExit = process.exitCode;
  try {
    program.parse(['node', 'bazel-git-lfs', ...args]);
    return new Promise((resolve) => {
      const started = Date.now();
      const poll = (): void => {
        if (process.exitCode !== originalExit || Date.now() - started > 120_000) {
          const code = process.exitCode;
          process.exitCode = originalExit;
          resolve(typeof code === 'number' ? code : 0);
          return;
        }
        setTimeout(poll, 10);
      };
      poll();
    });
  } catch (err) {
    process.exitCode = originalExit;
    const e = err as { code?: string };
    return Promise.resolve(
      e.code === 'commander.helpDisplayed' || e.code === 'commander.version' ? 0 : 2,
    );
  }
}

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bgl-qs-'));
  cleanups.push(dir);
  return dir;
}

const ALPHA = readFileSync(join(FIXTURES, 'alpha.bin'));
const ALPHA_SHA = sha256.hexOfBuffer(ALPHA);
const BETA_SHA = sha256.hexOfBuffer(readFileSync(join(FIXTURES, 'beta.bin')));


describe.skipIf(!lfs)('quickstart.md flow via the real CLI surface', () => {
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
    for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
  });

  it('walks the documented populate + consume flows (SC-002/SC-003)', async () => {
    const projectA = tempProject();
    writeFileSync(
      join(projectA, 'WORKSPACE'),
      [
        `http_archive(`,
        `    name = "react",`,
        `    urls = ["${origin.url}/deep/react/v1.2/react.tar.gz"],`,
        `    sha256 = "${ALPHA_SHA}",`,
        `)`,
        ``,
        `http_archive(`,
        `    name = "beta",`,
        `    urls = ["${origin.url}/beta.tar.gz"],`,
        `    sha256 = "${BETA_SHA}",`,
        `)`,
        ``,
      ].join('\n'),
    );

    // 1. init → remote add → set-default (file:// for the local mirror)
    expect(await cli(['init'], projectA)).toBe(0);
    expect(await cli(['remote', 'add', '--url', `file://${mirror.barePath}`], projectA)).toBe(0);
    expect(await cli(['remote', 'set-default', 'default'], projectA)).toBe(0);

    // 2. inspect → snapshot
    expect(await cli(['inspect'], projectA)).toBe(0);
    expect(existsSync(join(projectA, '.bazel_git_lfs', 'dependencies.json'))).toBe(true);

    // 3. fetch → 2× fetched into the objects store
    expect(await cli(['fetch'], projectA)).toBe(0);
    expect(await ObjectsStore.forProject(projectA).size()).toBe(2);
    const requestsAfterPopulate = origin.totalRequests();

    // 4. push → mirror populated
    expect(await cli(['push'], projectA)).toBe(0);

    // 5. re-push → idempotent no-op
    const commitBefore = mirror.git(['rev-parse', 'origin/main']).stdout.trim();
    expect(await cli(['push'], projectA)).toBe(0);
    expect(mirror.git(['rev-parse', 'origin/main']).stdout.trim()).toBe(commitBefore);

    // 6. second machine: fresh copy, same snapshot, pull
    const projectB = tempProject();
    expect(await cli(['init'], projectB)).toBe(0);
    expect(await cli(['remote', 'add', '--url', `file://${mirror.barePath}`], projectB)).toBe(0);
    expect(await cli(['remote', 'set-default', 'default'], projectB)).toBe(0);
    copyFileSync(
      join(projectA, '.bazel_git_lfs', 'dependencies.json'),
      join(projectB, '.bazel_git_lfs', 'dependencies.json'),
    );
    expect(await cli(['pull'], projectB)).toBe(0);

    expect(await ObjectsStore.forProject(projectB).size()).toBe(2);
    const storeB = ObjectsStore.forProject(projectB);
    expect(readFileSync(storeB.pathFor(`${origin.url}/deep/react/v1.2/react.tar.gz`, ALPHA_SHA).absolutePath)).toEqual(ALPHA);

    // 7. re-pull → cached, and origin untouched across pulls
    expect(await cli(['pull'], projectB)).toBe(0);
    expect(origin.totalRequests()).toBe(requestsAfterPopulate);
  });
});
