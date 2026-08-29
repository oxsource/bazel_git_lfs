import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsProfileStore, ConfigError } from '@/config/store';

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bazel-git-lfs-test-'));
  return dir;
}

describe('FsProfileStore', () => {
  it('returns empty config for missing file', async () => {
    const store = new FsProfileStore();
    const config = await store.readConfig(join(tempDir(), 'none', 'config.json'));
    expect(config).toEqual({ active: null, profiles: {}, aliases: {} });
  });

  it('round-trips profiles and aliases', async () => {
    const dir = tempDir();
    const path = join(dir, 'config.json');
    const store = new FsProfileStore();
    const config = {
      active: 'default',
      profiles: {
        default: {
          alias: 'default',
          url: 'https://gitlab.example.com/bazel/mirror.git',
          createdAt: '2026-08-29T00:00:00.000Z',
          updatedAt: '2026-08-29T00:00:00.000Z',
        },
      },
      aliases: { company: 'https://gitlab.example.com/bazel/mirror.git' },
    };
    await store.writeConfig(path, config);
    const read = await store.readConfig(path);
    expect(read).toEqual(config);
  });

  it('throws a clear error on corrupted config', async () => {
    const dir = tempDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, '{ not valid json');
    const store = new FsProfileStore();
    await expect(store.readConfig(path)).rejects.toThrow(ConfigError);
    await expect(store.readConfig(path)).rejects.toThrow(/corrupted/);
  });

  it('throws a clear error on invalid profile structure', async () => {
    const dir = tempDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ profiles: { default: { url: 'bad' } } }));
    const store = new FsProfileStore();
    await expect(store.readConfig(path)).rejects.toThrow(ConfigError);
  });
});
