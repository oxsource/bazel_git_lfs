import { describe, expect, it } from 'vitest';
import { runCheckoutScan, type CheckoutTarget } from '@/mirror/checkout';

describe('checkout alias resolution', () => {
  it('resolves default alias to original target', async () => {
    const result = await runCheckoutScan({
      alias: 'default',
      resolveTarget: async () => ({ type: 'original', baseUrl: '' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('original');
  });

  it('resolves -- shorthand to default', async () => {
    const result = await runCheckoutScan({
      alias: '--',
      resolveTarget: async () => ({ type: 'original', baseUrl: '' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('original');
  });

  it('resolves @ shorthand to local', async () => {
    const result = await runCheckoutScan({
      alias: '@',
      resolveTarget: async () => ({ type: 'local', baseUrl: '' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('local');
  });

  it('resolves local alias to local target', async () => {
    const result = await runCheckoutScan({
      alias: 'local',
      resolveTarget: async () => ({ type: 'local', baseUrl: '' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('local');
  });

  it('resolves profile alias to remote target', async () => {
    const result = await runCheckoutScan({
      alias: 'production',
      resolveTarget: async () => ({ type: 'remote', baseUrl: 'https://mirror.example.com' }),
      readFiles: async () => ({}),
      rewriteFile: async () => false,
    });
    expect(result.target).toBe('remote');
  });
});

describe('checkout URL rewriting', () => {
  const manifest = {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    objects: {
      'ab12deadbeef123456789012345678901234567890123456789012345678901234': {
        path: 'com/example/bar/ab12deadbeef',
        sources: ['https://github.com/foo/bar'],
        firstSeenAt: '2026-01-01T00:00:00.000Z',
      },
    },
  };

  it('rewrites URLs to mirror target and reports changes', async () => {
    let rewriteCalled = false;
    const result = await runCheckoutScan({
      alias: 'production',
      manifest,
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
      resolveTarget: async () => ({ type: 'remote', baseUrl: 'https://mirror.example.com' }),
      readFiles: async () => ({
        'WORKSPACE': `http_archive(\n  name = "bar",\n  urls = ["https://mirror.example.com/ab12deadbeef123456789012345678901234567890123456789012345678901234/com/example/bar/ab12deadbeef"],\n)\n`,
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