import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ExternalResolver download fallback', () => {
  it('refuses download when no sha256 declared', async () => {
    const { ExternalResolver } = await import('@/inspect/external-resolver');
    const projectDir = mkdtempSync(join(tmpdir(), 'bgl-test-nosha-'));

    const resolver = new ExternalResolver(projectDir);
    const result = await resolver.resolve('B', {
      name: 'B', urls: ['https://example.org/B.tar.gz'], sha256: null,
      stripPrefix: null, sourceFile: 'WORKSPACE', resolved: true,
      origin: 'entry' as const, fromRepo: null, loadChain: [], alsoLoadedBy: [],
    });
    expect(result.status).toBe('unresolved');
    await resolver.cleanup();
  });

  it('downloads and extracts archive (mocked fetch, real tar)', async () => {
    const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'artifacts', 'B.tar.gz');
    const archiveBytes = await readFile(fixturePath);

    // Mock global fetch to serve the fixture bytes.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(archiveBytes as unknown as BodyInit, { status: 200 });

    try {
      const { ExternalResolver } = await import('@/inspect/external-resolver');
      const projectDir = mkdtempSync(join(tmpdir(), 'bgl-test-dl-'));

      const resolver = new ExternalResolver(projectDir);

      const result = await resolver.resolve('B', {
        name: 'B', urls: ['https://example.org/B.tar.gz'],
        sha256: 'eb2d14519eebc28edff8201a03cddbd12794fab5391935af61bcbc56f3a45a2d',
        stripPrefix: 'B-1.0',
        sourceFile: 'WORKSPACE', resolved: true,
        origin: 'entry' as const, fromRepo: null, loadChain: [], alsoLoadedBy: [],
      });

      expect(result.status).toBe('fallback');
      expect(result.rootDir).toBeTruthy();
      expect(result.temp).toBe(true);

      const bzlContent = await readFile(join(result.rootDir!, 'deps.bzl'), 'utf8');
      expect(bzlContent).toContain('openssl');

      // Cleanup removes temp directory.
      const tempRoot = result.rootDir!;
      await resolver.cleanup();
      const { stat } = await import('node:fs/promises');
      await expect(stat(tempRoot)).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});