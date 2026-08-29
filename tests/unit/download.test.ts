import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObjectsStore } from '@/objects/store';
import { downloadAndStore } from '@/objects/download';
import { sha256 } from '@/objects/sha256';

const CONTENT = Buffer.from('downloadable-fixture-content');
const SHA = sha256.hexOfBuffer(CONTENT);
const OTHER_SHA = sha256.hexOfBuffer(Buffer.from('entirely-different-bytes'));

function tempStore(): ObjectsStore {
  return new ObjectsStore(join(mkdtempSync(join(tmpdir(), 'bgl-dl-')), 'objects'));
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response> | never,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(handler(String(input), init)),
    ),
  );
}

describe('downloadAndStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tries URLs in order: network error then success stores the object', async () => {
    const store = tempStore();
    const ref = store.pathFor('https://github.com/facebook/react/x.tar.gz', SHA);
    const calls: string[] = [];
    stubFetch((url) => {
      calls.push(url);
      if (url.includes('a/1')) throw new Error('ECONNREFUSED');
      return new Response(CONTENT);
    });

    const outcome = await downloadAndStore(store, ['https://a/1', 'https://b/2'], ref);

    expect(outcome.status).toBe('fetched');
    expect(await store.has(ref)).toBe(true);
    expect(calls).toEqual(['https://a/1', 'https://b/2']);
  });

  it('skips non-2xx responses and continues to the next URL', async () => {
    const store = tempStore();
    const ref = store.pathFor('https://example.com/x.tgz', SHA);
    const calls: string[] = [];
    stubFetch((url) => {
      calls.push(url);
      if (calls.length === 1) return new Response('nope', { status: 500 });
      return new Response(CONTENT);
    });

    const outcome = await downloadAndStore(store, ['https://a/1', 'https://b/2'], ref);

    expect(outcome.status).toBe('fetched');
    expect(calls).toHaveLength(2);
  });

  it('fails with hash-mismatch (and stores nothing) when every URL mismatches', async () => {
    const store = tempStore();
    const ref = store.pathFor('https://example.com/corrupt.tgz', OTHER_SHA);
    stubFetch(() => new Response(CONTENT)); // bytes match CONTENT, not OTHER_SHA

    const outcome = await downloadAndStore(store, ['https://a/1'], ref);

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toBe('hash-mismatch');
    expect(await store.has(ref)).toBe(false);
  });

  it('fails with network when fetch itself always throws', async () => {
    const store = tempStore();
    const ref = store.pathFor('https://example.com/x.tgz', SHA);
    stubFetch(() => {
      throw new TypeError('fetch failed: getaddrinfo ENOTFOUND');
    });

    const outcome = await downloadAndStore(store, ['https://a/1'], ref);

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toBe('network');
    expect(outcome.attempts[0]?.error).toMatch(/ENOTFOUND/);
  });

  it('reports no-url-succeeded when attempts mix transport and hash failures', async () => {
    const store = tempStore();
    stubFetch((url) => {
      if (url.includes('first')) return new Response('x', { status: 503 });
      return new Response(CONTENT); // wrong content for OTHER_SHA ref below
    });

    const refWrongSha = store.pathFor('https://example.com/x.tgz', OTHER_SHA);
    const outcome = await downloadAndStore(
      store,
      ['https://a/first', 'https://b/second'],
      refWrongSha,
    );

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toBe('no-url-succeeded');
    expect(outcome.attempts).toHaveLength(2);
  });

  it('rejects missing-sha256 refs without any request (G1)', async () => {
    const store = tempStore();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const bogusRef = { ...store.pathFor('https://a/1', SHA), sha256: '' };

    const outcome = await downloadAndStore(store, ['https://a/1'], bogusRef);

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toBe('missing-sha256');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aborts hung downloads after the per-attempt timeout', async () => {
    const store = tempStore();
    const ref = store.pathFor('https://example.com/x.tgz', SHA);
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new DOMException('This operation was aborted', 'AbortError'));
            });
          }
        });
      }),
    );

    const outcome = await downloadAndStore(store, ['https://a/hang'], ref, { timeoutMs: 50 });

    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toBe('network');
    expect(outcome.attempts[0]?.error).toMatch(/abort|timeout/i);
  });
});
