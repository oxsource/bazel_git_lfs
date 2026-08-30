import { describe, expect, it } from 'vitest';
import { runCheckoutScan, isLocalFallbackUrl, type CheckoutTarget } from '@/mirror/checkout';

describe('isLocalFallbackUrl', () => {
  it('treats localhost:8022 as a normal URL (not a fallback)', () => {
    expect(isLocalFallbackUrl('http://localhost:8022/com/github/foo/bar.zip')).toBe(false);
  });

  it('treats other localhost ports as fallback URLs', () => {
    expect(isLocalFallbackUrl('http://localhost:8080/third_party/deps/x.zip')).toBe(true);
    expect(isLocalFallbackUrl('http://localhost:9000/x.zip')).toBe(true);
  });

  it('treats non-localhost URLs as normal', () => {
    expect(isLocalFallbackUrl('https://github.com/foo/bar.zip')).toBe(false);
  });
});

describe('checkout alias resolution', () => {
  it('resolves default alias to original target', async () => {
    const result = await runCheckoutScan({
      alias: 'default',
      dependencies: [],
      resolveTarget: async () => ({ type: 'original', baseUrl: '' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('original');
  });

  it('resolves -- shorthand to default', async () => {
    const result = await runCheckoutScan({
      alias: '--',
      dependencies: [],
      resolveTarget: async () => ({ type: 'original', baseUrl: '' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('original');
  });

  it('resolves @ shorthand to local', async () => {
    const result = await runCheckoutScan({
      alias: '@',
      dependencies: [],
      resolveTarget: async () => ({ type: 'local', baseUrl: '' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('local');
  });

  it('resolves local alias to local target', async () => {
    const result = await runCheckoutScan({
      alias: 'local',
      dependencies: [],
      resolveTarget: async () => ({ type: 'local', baseUrl: '' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('local');
  });

  it('resolves profile alias to remote target', async () => {
    const result = await runCheckoutScan({
      alias: 'production',
      dependencies: [],
      resolveTarget: async () => ({ type: 'remote', baseUrl: 'https://mirror.example.com' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('remote');
  });
});

describe('checkout URL rewriting', () => {
  const SHA = 'ab12deadbeef123456789012345678901234567890123456789012345678901234';

  const manifest = {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    objects: {
      [SHA]: {
        path: 'com/example/bar/ab12deadbeef',
        sources: ['https://github.com/foo/bar'],
        firstSeenAt: '2026-01-01T00:00:00.000Z',
      },
    },
  };

  const deps = [{ name: 'bar', sha256: SHA, urls: ['https://github.com/foo/bar'] }];

  it('rewrites URLs to mirror target and reports changes', async () => {
    let rewriteCalled = false;
    const result = await runCheckoutScan({
      alias: 'production',
      manifest,
      dependencies: deps,
      resolveTarget: async () => ({ type: 'remote', baseUrl: 'https://mirror.example.com' }),
      readFiles: async () => ({
        'WORKSPACE': `http_archive(\n  name = "bar",\n  urls = ["https://github.com/foo/bar"],\n)\n`,
      }),
      rewriteFile: async (_path, _content, _before, _after) => {
        rewriteCalled = true;
        return true;
      },
    });
    expect(rewriteCalled).toBe(true);
    expect(result.changed).toBe(1);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].dependency).toBe('bar');
  });

  it('is idempotent when URLs already match target', async () => {
    let rewriteCalled = false;
    const result = await runCheckoutScan({
      alias: 'production',
      manifest,
      dependencies: deps,
      resolveTarget: async () => ({ type: 'remote', baseUrl: 'https://mirror.example.com' }),
      readFiles: async () => ({
        'WORKSPACE': `http_archive(\n  name = "bar",\n  urls = ["https://mirror.example.com/com/example/bar/ab12deadbeef"],\n)\n`,
      }),
      rewriteFile: async () => {
        rewriteCalled = true;
        return false;
      },
    });
    expect(rewriteCalled).toBe(false);
    expect(result.changed).toBe(0);
    expect(result.unchanged).toBe(1);
  });

  it('generates confirmation output with before/after URLs', async () => {
    const result = await runCheckoutScan({
      alias: 'production',
      manifest,
      dependencies: deps,
      resolveTarget: async () => ({ type: 'remote', baseUrl: 'https://mirror.example.com' }),
      readFiles: async () => ({
        'WORKSPACE': `http_archive(\n  name = "bar",\n  urls = ["https://github.com/foo/bar"],\n)\n`,
      }),
      rewriteFile: async (_path, _content, _before, _after) => true,
    });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].before).toBe('https://github.com/foo/bar');
    expect(result.changes[0].after).toContain('mirror.example.com');
  });
});