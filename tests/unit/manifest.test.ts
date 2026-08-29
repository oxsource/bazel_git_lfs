import { describe, expect, it } from 'vitest';
import {
  emptyManifest,
  mergeManifest,
  parseManifest,
  serializeManifest,
  ManifestError,
} from '@/mirror/manifest';
import { MANIFEST_VERSION } from '@/mirror/models';

const SHA = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe('manifest merge semantics (research decision 5)', () => {
  it('adds a fresh entry with path/sources/firstSeenAt', () => {
    const now = '2026-08-29T00:00:00.000Z';
    const merged = mergeManifest(emptyManifest(now), [
      { sha256: SHA, path: 'com/github/foo/bar/aaa', sources: ['https://u1/x'] },
    ], now);
    expect(merged.objects[SHA]).toEqual({
      path: 'com/github/foo/bar/aaa',
      sources: ['https://u1/x'],
      firstSeenAt: now,
    });
    expect(merged.updatedAt).toBe(now);
    expect(merged.version).toBe(MANIFEST_VERSION);
  });

  it('unions source URLs for the same sha256 and keeps the primary first', () => {
    const now = '2026-08-29T00:00:00.000Z';
    const later = '2026-08-30T00:00:00.000Z';
    let m = mergeManifest(emptyManifest(now), [
      { sha256: SHA, path: 'com/github/foo/bar/aaa', sources: ['https://u1/x'] },
    ], now);
    m = mergeManifest(m, [
      { sha256: SHA, path: 'ignored', sources: ['https://u2/x', 'https://u1/x'] },
    ], later);

    expect(m.objects[SHA].sources).toEqual(['https://u1/x', 'https://u2/x']);
    expect(m.objects[SHA].path).toBe('com/github/foo/bar/aaa'); // original path kept
    expect(m.objects[SHA].firstSeenAt).toBe(now); // first-seen preserved
    expect(m.updatedAt).toBe(later); // refreshed when changed
  });

  it('does not bump updatedAt when nothing changed', () => {
    const now = '2026-08-29T00:00:00.000Z';
    const m = mergeManifest(emptyManifest(now), [
      { sha256: SHA, path: 'com/github/foo/bar/aaa', sources: ['https://u1/x'] },
    ], now);
    const unchanged = mergeManifest(m, [
      { sha256: SHA, path: 'whatever', sources: ['https://u1/x'] },
    ], '2026-09-01T00:00:00.000Z');
    expect(unchanged.updatedAt).toBe(now);
  });

  it('merges independent entries in one pass', () => {
    const m = mergeManifest(emptyManifest(), [
      { sha256: SHA, path: 'p1', sources: ['https://a'] },
      { sha256: OTHER, path: 'p2', sources: ['https://b'] },
    ]);
    expect(Object.keys(m.objects)).toHaveLength(2);
  });
});

describe('manifest parse/validate', () => {
  it('round-trips through serializeManifest', () => {
    const m = mergeManifest(emptyManifest(), [
      { sha256: SHA, path: 'com/github/foo/bar/aaa', sources: ['https://u1/x'] },
    ]);
    expect(parseManifest(serializeManifest(m))).toEqual(m);
  });

  it('throws ManifestError on corrupted JSON', () => {
    expect(() => parseManifest('{ not json')).toThrow(ManifestError);
  });

  it('throws ManifestError on unsupported version', () => {
    expect(() => parseManifest('{"version": 99, "updatedAt": "x", "objects": {}}')).toThrow(
      /unsupported version/,
    );
  });

  it('throws ManifestError on a malformed object key', () => {
    const raw = JSON.stringify({
      version: MANIFEST_VERSION,
      updatedAt: 'x',
      objects: { nothex: { path: 'p', sources: ['s'], firstSeenAt: 'y' } },
    });
    expect(() => parseManifest(raw)).toThrow(/invalid object key/);
  });

  it('throws ManifestError on a malformed entry', () => {
    const raw = JSON.stringify({
      version: MANIFEST_VERSION,
      updatedAt: 'x',
      objects: { [SHA]: { sources: [] } },
    });
    expect(() => parseManifest(raw)).toThrow(/manifest entry/);
  });
});
