import { describe, expect, it } from 'vitest';
import { deriveObjectPath, objectRelativePath, objectSha256RelativePath } from '@/objects/object-path';

const SHA = 'a'.repeat(64);

describe('deriveObjectPath (Maven-style reversed domain)', () => {
  it('reverses the host, omits generic segments, and preserves the filename', () => {
    const p = deriveObjectPath(
      'https://github.com/facebook/react/releases/download/v1.2/x.tar.gz',
      SHA,
    );
    expect(p.directory).toBe('com/github/facebook/react/v1.2');
    expect(p.fileName).toBe('x.tar.gz');
    expect(p.fallback).toBe(false);
  });

  it('omits common generic path segments (releases/download/archive/...)', () => {
    expect(
      deriveObjectPath('https://github.com/opencv/opencv/releases/download/4.10.0/a.zip', SHA).directory,
    ).toBe('com/github/opencv/opencv/4.10.0');
    expect(
      deriveObjectPath('https://github.com/nothings/stb/archive/b42.tar.gz', SHA).directory,
    ).toBe('com/github/nothings/stb');
  });

  it('keeps the org segment when the file sits directly under it', () => {
    expect(deriveObjectPath('https://github.com/facebook/react/react.tar.gz', SHA).directory).toBe(
      'com/github/facebook/react',
    );
    expect(deriveObjectPath('https://github.com/facebook/react/react.tar.gz', SHA).fileName).toBe(
      'react.tar.gz',
    );
  });

  it('handles bare-host URLs (no directories beyond the filename)', () => {
    expect(deriveObjectPath('https://example.com/x.tar.gz', SHA).directory).toBe('com/example');
    expect(deriveObjectPath('https://example.com/x.tar.gz', SHA).fileName).toBe('x.tar.gz');
  });

  it('handles multi-level TLDs', () => {
    expect(deriveObjectPath('https://storage.googleapis.com/bucket/x.zip', SHA).directory).toBe(
      'com/googleapis/storage/bucket',
    );
  });

  it('lowercases host segments but preserves path-segment case', () => {
    expect(deriveObjectPath('https://GitHub.com/Foo/Bar/file.TGZ', SHA).directory).toBe(
      'com/github/Foo/Bar',
    );
    expect(deriveObjectPath('https://GitHub.com/Foo/Bar/file.TGZ', SHA).fileName).toBe('file.TGZ');
  });

  it('drops empty and dot segments from the path', () => {
    expect(deriveObjectPath('https://example.com/a//b/./c.tgz', SHA).directory).toBe('com/example/a/b');
  });

  it('treats trailing-slash paths as pure directories', () => {
    expect(deriveObjectPath('https://example.com/a/b/', SHA).directory).toBe('com/example/a/b');
    expect(deriveObjectPath('https://example.com/a/b/', SHA).fileName).toBe('object');
  });

  it('ignores query strings and fragments', () => {
    expect(deriveObjectPath('https://example.com/a/file.tgz?token=secret#frag', SHA).directory).toBe(
      'com/example/a',
    );
  });

  it('falls back for IP hosts with a warning (deterministic single bucket)', () => {
    const p = deriveObjectPath('http://127.0.0.1:8080/x.bin', SHA);
    expect(p.fallback).toBe(true);
    expect(p.directory).toBe('_other/127.0.0.1_8080');
    expect(p.warning).toMatch(/IP-literal host/);
  });

  it('falls back for unparsable URLs', () => {
    const p = deriveObjectPath('not a url', SHA);
    expect(p.fallback).toBe(true);
    expect(p.directory.startsWith('_other/')).toBe(true);
    expect(p.warning).toMatch(/unparsable URL/);
  });

  it('falls back for non-http(s) protocols', () => {
    const p = deriveObjectPath('ftp://files.example.com/x.tgz', SHA);
    expect(p.fallback).toBe(true);
    expect(p.directory.startsWith('_other/')).toBe(true);
  });

  it('sanitizes hostile path segments to [a-zA-Z0-9._-]', () => {
    const p = deriveObjectPath('https://example.com/na%23%7Bme%7D/seg%202/x.tgz', SHA);
    expect(p.directory).toMatch(/^com\/example\/[a-zA-Z0-9._-]+\/seg[a-zA-Z0-9._-]*$/);
    expect(p.directory).not.toMatch(/[#{} ]/);
  });
});

describe('objectRelativePath', () => {
  it('uses the original file name instead of the sha256', () => {
    expect(
      objectRelativePath('https://github.com/facebook/react/x.tar.gz', SHA),
    ).toBe('com/github/facebook/react/x.tar.gz');
  });
});

describe('objectSha256RelativePath', () => {
  it('appends a .sha256 sidecar next to the object file', () => {
    expect(
      objectSha256RelativePath('https://github.com/facebook/react/x.tar.gz', SHA),
    ).toBe('com/github/facebook/react/x.tar.gz.sha256');
  });
});
