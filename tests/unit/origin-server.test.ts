import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startOriginServer } from '../helpers/origin-server';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/artifacts',
);
const ALPHA_SHA = '15a019bdffa8f446afa81fe49b132cde0ce178a62978e5f885f5ae9be094ad07';

describe('origin-server helper', () => {
  it('serves fixture files and counts hits', async () => {
    const origin = await startOriginServer(FIXTURES, {
      '/alpha.bin': { file: 'alpha.bin' },
      '/missing': { status: 404 },
    });
    try {
      const res = await fetch(`${origin.url}/alpha.bin`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-length')).toBe('566');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(ALPHA_SHA);
      expect(origin.hits('/alpha.bin')).toBe(1);
      expect(origin.misses()).toBe(0);
    } finally {
      await origin.close();
    }
  });

  it('serves raw bodies, statuses and truncation', async () => {
    const origin = await startOriginServer(FIXTURES, {
      '/bad': { status: 500, body: Buffer.from('nope') },
      '/cut': { file: 'alpha.bin', truncateAfterBytes: 10 },
    });
    try {
      const bad = await fetch(`${origin.url}/bad`);
      expect(bad.status).toBe(500);
      const trunc = await fetch(`${origin.url}/cut`);
      expect((await trunc.arrayBuffer()).byteLength).toBe(10);
    } finally {
      await origin.close();
    }
  });
});
