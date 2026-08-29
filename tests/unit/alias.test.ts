import { describe, expect, it } from 'vitest';
import { FsAliasManager } from '@/config/alias';
import { ConfigError } from '@/config/store';
import type { ConfigFile } from '@/config/store';

const emptyConfig: ConfigFile = { active: null, profiles: {}, aliases: {} };

describe('FsAliasManager', () => {
  it('adds and lists aliases', () => {
    const manager = new FsAliasManager();
    const cfg = manager.add(emptyConfig, 'company', 'https://gitlab.example.com/bazel/mirror.git');
    expect(manager.list(cfg)).toEqual({ company: 'https://gitlab.example.com/bazel/mirror.git' });
  });

  it('rejects alias values starting with @', () => {
    const manager = new FsAliasManager();
    expect(() => manager.add(emptyConfig, 'a', '@b')).toThrow(ConfigError);
  });

  it('removes aliases', () => {
    const manager = new FsAliasManager();
    const cfg = manager.add(emptyConfig, 'company', 'https://gitlab.example.com/bazel/mirror.git');
    const removed = manager.remove(cfg, 'company');
    expect(manager.list(removed)).toEqual({});
  });

  it('resolves @-prefixed urls via alias table', () => {
    const manager = new FsAliasManager();
    const cfg = manager.add(emptyConfig, 'company', 'https://gitlab.example.com/bazel/mirror.git');
    const resolved = manager.resolveUrl('@company', cfg);
    expect(resolved).toEqual({
      url: 'https://gitlab.example.com/bazel/mirror.git',
      viaAlias: 'company',
    });
  });

  it('passes through non-@ urls verbatim', () => {
    const manager = new FsAliasManager();
    const resolved = manager.resolveUrl('https://gitlab.example.com/bazel/mirror.git', emptyConfig);
    expect(resolved).toEqual({
      url: 'https://gitlab.example.com/bazel/mirror.git',
      viaAlias: null,
    });
  });

  it('errors on unknown alias', () => {
    const manager = new FsAliasManager();
    expect(() => manager.resolveUrl('@missing', emptyConfig)).toThrow(ConfigError);
    expect(() => manager.resolveUrl('@missing', emptyConfig)).toThrow(/missing/);
  });
});
