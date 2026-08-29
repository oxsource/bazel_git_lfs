import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObjectsStore, HashMismatchError } from '@/objects/store';
import { sha256 } from '@/objects/sha256';

function tempObjectsDir(): string {
  return join(mkdtempSync(join(tmpdir(), 'bgl-store-')), 'objects');
}

const CONTENT = Buffer.from('fixture-object-content');
const SHA = sha256.hexOfBuffer(CONTENT);
const URL = 'https://github.com/facebook/react/react.tar.gz';

describe('ObjectsStore', () => {
  it('derives the Maven-style path and stores buffer content atomically', async () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor(URL, SHA);
    expect(ref.relativePath).toBe(`com/github/facebook/react/${SHA}`);

    await store.put(ref, CONTENT);
    expect(readFileSync(ref.absolutePath)).toEqual(CONTENT);
    expect(await store.has(ref)).toBe(true);
    expect(await store.get(ref)).toBe(ref.absolutePath);
    expect(await store.size()).toBe(1);
  });

  it('rejects content whose sha256 mismatches and stores nothing (G1)', async () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor(URL, SHA);
    await expect(store.put(ref, Buffer.from('tampered'))).rejects.toThrow(HashMismatchError);
    expect(existsSync(ref.absolutePath)).toBe(false);
    expect(await store.has(ref)).toBe(false);
    // no temp leftovers
    const dir = ref.absolutePath.slice(0, ref.absolutePath.lastIndexOf('/'));
    const leftovers = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith('.tmp'))
      : [];
    expect(leftovers).toHaveLength(0);
  });

  it('treats corrupt local entries as absent (has=false, get=null)', async () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor(URL, SHA);
    await store.put(ref, CONTENT);
    writeFileSync(ref.absolutePath, 'corrupted-after-the-fact');

    expect(await store.has(ref)).toBe(false);
    expect(await store.get(ref)).toBeNull();
    expect(await store.corruptReason(ref)).toBe('hash-mismatch');
  });

  it('reports absent for missing entries', async () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor(URL, SHA);
    expect(await store.corruptReason(ref)).toBe('absent');
    expect(await store.get(ref)).toBeNull();
  });

  it('streams content to a temp file while hashing and renames on verify', async () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor(URL, SHA);
    const { Readable } = await import('node:stream');
    const stream = Readable.from([CONTENT.subarray(0, 5), CONTENT.subarray(5)]);
    await store.put(ref, stream);
    expect(await store.has(ref)).toBe(true);
  });

  it('leaves no partial file when a stream fails mid-download', async () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor(URL, SHA);
    const { Readable } = await import('node:stream');
    const failing = new Readable({
      read() {
        this.push(CONTENT.subarray(0, 4));
        process.nextTick(() => this.destroy(new Error('mid-download failure')));
      },
    });
    await expect(store.put(ref, failing)).rejects.toThrow('mid-download failure');
    expect(existsSync(ref.absolutePath)).toBe(false);
    expect(readdirSync(store.objectsDir, { recursive: true }).filter((f) => String(f).endsWith('.tmp'))).toHaveLength(0);
  }, 15000);

  it('stores identical content once (put twice → one file)', async () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor(URL, SHA);
    await store.put(ref, CONTENT);
    await store.put(ref, CONTENT);
    expect(await store.size()).toBe(1);
  });

  it('putFromFile materializes from an existing file', async () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor(URL, SHA);
    const src = join(store.objectsDir, '..', 'src.bin');
    writeFileSync(src, CONTENT);
    await store.putFromFile(ref, src);
    expect(await store.has(ref)).toBe(true);
    rmSync(src);
  });

  it('throws on invalid sha256 in pathFor', () => {
    const store = new ObjectsStore(tempObjectsDir());
    expect(() => store.pathFor(URL, 'not-a-hash')).toThrow(/invalid sha256/);
  });

  it('marks exotic URLs as fallback refs with a warning', () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor('http://10.0.0.1/x.bin', SHA);
    expect(ref.fallback).toBe(true);
    expect(ref.relativePath).toBe(`_other/10.0.0.1/${SHA}`);
    expect(ref.warning).toMatch(/IP-literal/);
  });

  it('cleans up temp files after a failed put so size() stays accurate', async () => {
    const store = new ObjectsStore(tempObjectsDir());
    const ref = store.pathFor(URL, SHA);
    await store.put(ref, CONTENT);
    const bad = store.pathFor('https://github.com/facebook/react/other.tar.gz', SHA);
    await expect(store.put(bad, Buffer.from('bad'))).rejects.toThrow(HashMismatchError);
    expect(await store.size()).toBe(1);
  });
});
