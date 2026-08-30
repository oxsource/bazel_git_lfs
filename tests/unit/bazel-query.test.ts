import { describe, expect, it } from 'vitest';
import { extractAttributesForName } from '@/inspect/bazel-query';
import { extractDepsByRegex } from '@/inspect/regex-extractor';

describe('extractDepsByRegex (generic regex fallback)', () => {
  it('extracts dict-driven deps with name/url/sha256 (cpp_network style)', () => {
    const content = `_DEPS = [
  {
    "name": "curl",
    "sha256": "f91249c87f68ea00cf27c44fdfa5a78423e41e71b7d408e5901a9896d905c495",
    "strip_prefix": "curl-8.7.1",
    "urls": ["https://curl.se/download/curl-8.7.1.tar.gz"],
  },
  {
    "name": "openssl",
    "sha256": "e74504ed7035295ec7062b1da16c15b57ff2a03cd2064a28d8c39458cacc45fc",
    "strip_prefix": "openssl-openssl-3.0.13",
    "urls": ["https://github.com/openssl/openssl/archive/refs/tags/openssl-3.0.13.tar.gz"],
  },
]`;
    const deps = extractDepsByRegex(content);
    expect(deps.map((d) => d.name).sort()).toEqual(['curl', 'openssl']);
    const curl = deps.find((d) => d.name === 'curl');
    expect(curl?.urls).toEqual(['https://curl.se/download/curl-8.7.1.tar.gz']);
    expect(curl?.sha256).toBe('f91249c87f68ea00cf27c44fdfa5a78423e41e71b7d408e5901a9896d905c495');
    expect(curl?.stripPrefix).toBe('curl-8.7.1');
  });

  it('extracts direct http_archive calls', () => {
    const content = `http_archive(
  name = "abseil",
  urls = ["https://github.com/abseil/abseil-cpp/archive/refs/tags/20250127.0.tar.gz"],
  sha256 = "1111111111111111111111111111111111111111111111111111111111111111",
  strip_prefix = "abseil-cpp-20250127.0",
)`;
    const deps = extractDepsByRegex(content);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('abseil');
    expect(deps[0].urls[0]).toContain('20250127.0.tar.gz');
  });

  it('ignores dicts without both name and urls', () => {
    const content = `_MAP = {
  "key": "value",
  "nested": { "a": 1 },
}`;
    expect(extractDepsByRegex(content)).toHaveLength(0);
  });
});

describe('extractAttributesForName (name authoritative, attrs from regex)', () => {
  const sources = [
    `_DEPS = [
  { "name": "curl", "urls": ["https://curl.se/x.tar.gz"], "sha256": "aaaa", "strip_prefix": "curl-x" },
  { "name": "openssl", "urls": ["https://openssl.org/y.tar.gz"], "sha256": "bbbb" },
]`,
  ];

  it('finds attributes for a known name across sources', () => {
    const dep = extractAttributesForName('curl', sources);
    expect(dep?.name).toBe('curl');
    expect(dep?.urls[0]).toBe('https://curl.se/x.tar.gz');
    expect(dep?.sha256).toBe('aaaa');
    expect(dep?.stripPrefix).toBe('curl-x');
  });

  it('returns null for an unknown name', () => {
    expect(extractAttributesForName('nonexistent', sources)).toBeNull();
  });
});
