import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBazelFile } from '@/inspect/bazel-parser';

const fixturesDir = fileURLToPath(new URL('../fixtures/projects', import.meta.url));

function fixture(project: string, file: string): string {
  return readFileSync(join(fixturesDir, project, file), 'utf8');
}

describe('bazel-parser', () => {
  it('parses direct http_archive/http_file rules', () => {
    const result = parseBazelFile(fixture('direct', 'WORKSPACE'), 'WORKSPACE');
    expect(result.dependencies).toHaveLength(3);
    const abseil = result.dependencies.find((d) => d.name === 'abseil');
    expect(abseil).toMatchObject({
      urls: ['https://github.com/abseil/abseil-cpp/archive/refs/tags/20250127.0.tar.gz'],
      sha256: '1111111111111111111111111111111111111111111111111111111111111111',
      stripPrefix: 'abseil-cpp-20250127.0',
      sourceFile: 'WORKSPACE',
      resolved: true,
    });
  });

  it('handles single url, urls list, comments, and trailing commas', () => {
    const result = parseBazelFile(fixture('multiurl', 'WORKSPACE'), 'WORKSPACE');
    expect(result.dependencies).toHaveLength(2);
    const curl = result.dependencies.find((d) => d.name === 'libcurl');
    expect(curl?.urls).toEqual([
      'https://github.com/curl/curl/releases/download/curl-8_5_0/curl-8.5.0.tar.gz',
      'https://mirror.example.com/curl-8.5.0.tar.gz',
    ]);
    expect(curl?.sha256).toBe('4444444444444444444444444444444444444444444444444444444444444444');
  });

  it('resolves for-loop generated dependencies from a variable list of dicts', () => {
    const result = parseBazelFile(fixture('loop', 'WORKSPACE'), 'WORKSPACE');
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies.map((d) => d.name).sort()).toEqual(['boost', 'spdlog']);
    const boost = result.dependencies.find((d) => d.name === 'boost');
    expect(boost?.urls[0]).toContain('boost-1.84.0');
    expect(boost?.sha256).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('reports no dependencies for an empty project', () => {
    const result = parseBazelFile(fixture('empty', 'WORKSPACE'), 'WORKSPACE');
    expect(result.dependencies).toHaveLength(0);
  });

  it('extracts load() targets', () => {
    const result = parseBazelFile(fixture('loaded', 'WORKSPACE'), 'WORKSPACE');
    expect(result.loads).toEqual([{ target: '//:deps.bzl', symbols: ['fixture_deps'] }]);
  });

  it('extracts dependencies from MODULE.bazel', () => {
    const result = parseBazelFile(fixture('module', 'MODULE.bazel'), 'MODULE.bazel');
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies.map((d) => d.name).sort()).toEqual(['libdatachannel', 'some_patch']);
  });

  it('throws naming the file for unbalanced brackets', () => {
    expect(() => parseBazelFile('http_archive(\n  name = "x",\n', 'WORKSPACE')).toThrow(
      'Cannot parse Bazel file: WORKSPACE',
    );
  });

  it('throws naming the file for an unterminated string', () => {
    expect(() => parseBazelFile('http_archive(name = "unterminated)', 'WORKSPACE')).toThrow(
      'Cannot parse Bazel file: WORKSPACE',
    );
  });
});
