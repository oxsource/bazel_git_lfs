import { describe, expect, it } from 'vitest';
import { runStatusScan } from '@/mirror/status';
import type { MirrorManifest, ManifestEntry } from '@/mirror/models';

const validHash = 'ab1234567890123456789012345678901234567890123456789012345678901234';

function makeEntry(overrides: Partial<ManifestEntry> & { path: string }): ManifestEntry {
  return {
    sources: ['https://github.com/example/repo'],
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeManifest(entries: Record<string, ManifestEntry>): MirrorManifest {
  return { version: 1, updatedAt: '2026-01-01T00:00:00.000Z', objects: entries };
}

describe('status classification', () => {
  it('reports all artifacts as valid when SHA256 matches', async () => {
    const manifest = makeManifest({
      [validHash]: makeEntry({ path: 'com/example/a/file' }),
      'cd3456789012345678901234567890123456789012345678901234567890123456': makeEntry({ path: 'com/example/b/file' }),
    });

    const result = await runStatusScan(manifest, {
      materialize: async () => ['/tmp/obj/a', '/tmp/obj/b'],
      sha256HexOfFile: async (filePath) => {
        if (filePath === '/tmp/obj/a') return validHash;
        return 'cd3456789012345678901234567890123456789012345678901234567890123456';
      },
    });

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.status === 'valid')).toBe(true);
    expect(result.summary).toEqual({ total: 2, valid: 2, corrupt: 0, missing: 0 });
  });

  it('reports an artifact as corrupt when SHA256 mismatches', async () => {
    const manifest = makeManifest({
      'ab1234567890123456789012345678901234567890123456789012345678901234': makeEntry({ path: 'com/example/a/ab12…' }),
    });
    const actualHash = 'deadbeef1234567890123456789012345678901234567890123456789012345678';

    const result = await runStatusScan(manifest, {
      materialize: async () => ['/tmp/obj/a'],
      sha256HexOfFile: async () => actualHash,
    });

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('corrupt');
    expect(result.results[0].expected).toBe('ab1234567890123456789012345678901234567890123456789012345678901234');
    expect(result.results[0].actual).toBe(actualHash);
    expect(result.summary).toEqual({ total: 1, valid: 0, corrupt: 1, missing: 0 });
  });

  it('reports an artifact as missing when the materialized file cannot be read', async () => {
    const manifest = makeManifest({
      'ab1234567890123456789012345678901234567890123456789012345678901234': makeEntry({ path: 'com/example/a/ab12…' }),
    });

    const result = await runStatusScan(manifest, {
      materialize: async () => ['/tmp/obj/a'],
      sha256HexOfFile: async () => { throw new Error('ENOENT'); },
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('missing');
    expect(result.summary).toEqual({ total: 1, valid: 0, corrupt: 0, missing: 1 });
  });

  it('exits non-zero when any artifact is corrupt or missing', async () => {
    const manifest = makeManifest({
      'ab1234567890123456789012345678901234567890123456789012345678901234': makeEntry({ path: 'com/example/a/ab12…' }),
    });

    const result = await runStatusScan(manifest, {
      materialize: async () => ['/tmp/obj/a'],
      sha256HexOfFile: async () => { throw new Error('ENOENT'); },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('status filtering', () => {
  const hashA = 'ab1234567890123456789012345678901234567890123456789012345678901234';
  const hashC = 'cd3456789012345678901234567890123456789012345678901234567890123456';
  const hashE = 'ef5678901234567890123456789012345678901234567890123456789012345678';

  const manifest = makeManifest({
    [hashA]: makeEntry({
      path: 'com/github/foo/ab12…',
      sources: ['https://github.com/foo/bar'],
    }),
    [hashC]: makeEntry({
      path: 'com/github/baz/cd34…',
      sources: ['https://github.com/baz/qux'],
    }),
    [hashE]: makeEntry({
      path: 'com/example/other/ef56…',
      sources: ['https://gitlab.com/example/repo'],
    }),
  });
  const deps = {
    materialize: async (paths: string[]) => paths.map((p) => `/tmp/objects/${p}`),
    sha256HexOfFile: async (filePath: string) => {
      if (filePath.includes('ab12')) return hashA;
      if (filePath.includes('cd34')) return hashC;
      return hashE;
    },
  };

  it('filters by sha256 prefix (case-insensitive)', async () => {
    const result = await runStatusScan(manifest, deps, { sha256Prefix: 'ab' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].sha256).toBe(hashA);
  });

  it('filters by source URL substring (case-insensitive)', async () => {
    const result = await runStatusScan(manifest, deps, { sourceUrl: 'github.com' });
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.status === 'valid')).toBe(true);
  });

  it('filters by keyword (case-insensitive substring across path and URLs)', async () => {
    const result = await runStatusScan(manifest, deps, { keyword: 'example' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].sha256).toBe(hashE);
  });

  it('returns empty result when keyword matches no artifact', async () => {
    const result = await runStatusScan(manifest, deps, { keyword: 'nonexistent' });
    expect(result.results).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it('returns all artifacts when no filter is provided', async () => {
    const result = await runStatusScan(manifest, deps);
    expect(result.results).toHaveLength(3);
  });

  it('includes applied filters in the output', async () => {
    const result = await runStatusScan(manifest, deps, { sha256Prefix: 'ab', sourceUrl: 'github.com', keyword: 'test' });
    expect(result.filters).toEqual({ sha256Prefix: 'ab', sourceUrl: 'github.com', keyword: 'test' });
  });
});