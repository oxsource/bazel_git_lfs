import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsProfileStore, ConfigError } from '../../src/config/store';
import { ConfigResolver } from '../../src/config/resolve';
import type { ConfigFile } from '../../src/config/store';

interface Env {
  HOME?: string;
  BAZEL_GIT_LFS_HOME?: string;
}

function makeProfile(namespace: string, url: string): NonNullable<ConfigFile['profiles'][string]> {
  return {
    namespace,
    mirrorRepoUrl: url,
    gitLabHost: new URL(url).host,
    lfsEnabled: true,
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
  };
}

async function setupResolver(
  localConfig: ConfigFile,
  globalConfig: ConfigFile,
): Promise<{ resolver: ConfigResolver; cwd: string; env: Env }> {
  const root = mkdtempSync(join(tmpdir(), 'bazel-git-lfs-resolve-'));
  const cwd = join(root, 'project');
  mkdirSync(cwd, { recursive: true });
  const globalDir = join(root, 'home');
  mkdirSync(globalDir, { recursive: true });

  const store = new FsProfileStore();
  await store.writeConfig(join(cwd, '.bazel_git_lfs', 'config.json'), localConfig);
  await store.writeConfig(join(globalDir, 'config.json'), globalConfig);

  return { resolver: new ConfigResolver(store), cwd, env: { BAZEL_GIT_LFS_HOME: globalDir } };
}

describe('ConfigResolver', () => {
  it('prefers project-local profile over global (scope layering)', async () => {
    const { resolver, cwd, env } = await setupResolver(
      {
        active: 'default',
        profiles: { default: makeProfile('default', 'https://local.example.com/mirror.git') },
        aliases: {},
      },
      {
        active: 'default',
        profiles: { default: makeProfile('default', 'https://global.example.com/mirror.git') },
        aliases: {},
      },
    );
    const resolved = await resolver.resolve({ cwd, env });
    expect(resolved.scope).toBe('local');
    expect(resolved.profile.mirrorRepoUrl).toBe('https://local.example.com/mirror.git');
  });

  it('falls back to global when no local profile', async () => {
    const { resolver, cwd, env } = await setupResolver(
      { active: null, profiles: {}, aliases: {} },
      {
        active: 'default',
        profiles: { default: makeProfile('default', 'https://global.example.com/mirror.git') },
        aliases: {},
      },
    );
    const resolved = await resolver.resolve({ cwd, env });
    expect(resolved.scope).toBe('global');
    expect(resolved.profile.mirrorRepoUrl).toBe('https://global.example.com/mirror.git');
  });

  it('uses explicit namespace override', async () => {
    const { resolver, cwd, env } = await setupResolver(
      {
        active: 'default',
        profiles: {
          default: makeProfile('default', 'https://local.example.com/a.git'),
          team: makeProfile('team', 'https://local.example.com/b.git'),
        },
        aliases: {},
      },
      { active: null, profiles: {}, aliases: {} },
    );
    const resolved = await resolver.resolve({ cwd, env, namespace: 'team' });
    expect(resolved.namespace).toBe('team');
    expect(resolved.profile.mirrorRepoUrl).toBe('https://local.example.com/b.git');
  });

  it('errors when no profile exists anywhere', async () => {
    const { resolver, cwd, env } = await setupResolver(
      { active: null, profiles: {}, aliases: {} },
      { active: null, profiles: {}, aliases: {} },
    );
    await expect(resolver.resolve({ cwd, env })).rejects.toThrow(ConfigError);
    await expect(resolver.resolve({ cwd, env })).rejects.toThrow(/No mirror configured/);
  });

  it('resolveEffective merges local over global per-field', async () => {
    const local = makeProfile('default', 'https://local.example.com/mirror.git');
    const global = makeProfile('default', 'https://global.example.com/mirror.git');
    const { resolver, cwd, env } = await setupResolver(
      { active: 'default', profiles: { default: { ...local, lfsEnabled: false } }, aliases: {} },
      { active: 'default', profiles: { default: global }, aliases: {} },
    );
    const effective = await resolver.resolveEffective({ cwd, env });
    expect(effective.source).toBe('local');
    expect(effective.values.mirrorRepoUrl.value).toBe('https://local.example.com/mirror.git');
    expect(effective.values.lfsEnabled.value).toBe(false);
  });
});
