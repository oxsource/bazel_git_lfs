import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BazelConfig, toDependency } from '@/config/bazelconfig';
import { LOCAL_SERVER } from '@/config/constants';
import { CONFIG_DIR_NAME } from '@/config/paths';

function projectDirWith(bazelconfig: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bgl-config-'));
  mkdirSync(join(dir, CONFIG_DIR_NAME), { recursive: true });
  writeFileSync(join(dir, CONFIG_DIR_NAME, '.bazelconfig'), bazelconfig);
  return dir;
}

describe('BazelConfig', () => {
  it('returns defaults for a missing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bgl-config-'));
    const config = BazelConfig.fromFile(dir);
    expect(config.serverPort()).toBe(LOCAL_SERVER.PORT);
    expect(config.inspectExclude()).toEqual([]);
    expect(config.inspectAppend()).toEqual([]);
  });

  it('reads server port', () => {
    const dir = projectDirWith('[server]\nport = 9022\n');
    expect(BazelConfig.fromFile(dir).serverPort()).toBe(9022);
  });

  it('falls back to default port for invalid values', () => {
    for (const bad of ['abc', '0', '70000', '-1']) {
      const dir = projectDirWith(`[server]\nport = ${bad}\n`);
      expect(BazelConfig.fromFile(dir).serverPort()).toBe(LOCAL_SERVER.PORT);
    }
  });

  it('collects inspect.exclude from += and array literals', () => {
    const dir = projectDirWith(
      '[inspect]\nexclude = [a, b]\nexclude += c\n',
    );
    expect(BazelConfig.fromFile(dir).inspectExclude()).toEqual(['a', 'b', 'c']);
  });

  it('parses inspect.append rows into manual dependencies', () => {
    const dir = projectDirWith(
      '[inspect]\nappend = dep_a|https://x.org/a.tar.gz|sha1\nappend += dep_b|https://x.org/b.tar.gz|sha2|third_party\n',
    );
    const deps = BazelConfig.fromFile(dir).inspectAppend();
    expect(deps).toEqual([
      { name: 'dep_a', urls: ['https://x.org/a.tar.gz'], sha256: 'sha1', stripPrefix: null },
      { name: 'dep_b', urls: ['https://x.org/b.tar.gz'], sha256: 'sha2', stripPrefix: 'third_party' },
    ]);
  });

  it('ignores malformed append rows', () => {
    const dir = projectDirWith('[inspect]\nappend = not_enough_fields\n');
    expect(BazelConfig.fromFile(dir).inspectAppend()).toEqual([]);
  });
});

describe('toDependency', () => {
  it('converts a manual dependency into the scan model', () => {
    const dep = toDependency({ name: 'x', urls: ['https://x.org/a.tar.gz'], sha256: 'sha', stripPrefix: null });
    expect(dep).toEqual({
      name: 'x',
      urls: ['https://x.org/a.tar.gz'],
      sha256: 'sha',
      stripPrefix: null,
      sourceFile: 'manual',
      resolved: true,
    });
  });
});
