import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runRemoteAdd,
  runRemoteSetDefault,
  runRemoteRemove,
  runRemoteList,
  runRemoteAliasAdd,
  runRemoteAliasList,
  runRemoteAliasRemove,
} from '@/cli/remote';
import type { ConfigFile } from '@/config/store';

vi.mock('prompts', () => ({
  default: vi.fn(async () => ({ url: 'git@gitlab.example.com:bazel/mirror.git' })),
}));

interface Ctx {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

function setup(): Ctx {
  const root = mkdtempSync(join(tmpdir(), 'bazel-git-lfs-remote-'));
  const cwd = join(root, 'proj');
  mkdirSync(cwd, { recursive: true });
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  return { cwd, env: { ...process.env, BAZEL_GIT_LFS_HOME: home } };
}

async function readLocalConfig(ctx: Ctx): Promise<ConfigFile> {
  const raw = readFileSync(join(ctx.cwd, '.bazel_git_lfs', 'config.json'), 'utf8');
  return JSON.parse(raw) as ConfigFile;
}

async function quietAdd(ctx: Ctx, args: Record<string, unknown>): Promise<number> {
  return quiet(() => runRemoteAdd({ ...args, cwd: ctx.cwd, env: ctx.env } as never));
}

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
}

describe('remote add', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('saves a project-local profile by default (no --global)', async () => {
    const ctx = setup();
    const code = await quietAdd(ctx, { url: 'git@gitlab.example.com:bazel/mirror.git' });
    expect(code).toBe(0);
    const config = await readLocalConfig(ctx);
    expect(config.active).toBe('default');
    expect(config.profiles.default.url).toBe('git@gitlab.example.com:bazel/mirror.git');
  });

  it('defaults alias to default', async () => {
    const ctx = setup();
    await quietAdd(ctx, { url: 'https://gitlab.example.com/m.git' });
    const config = await readLocalConfig(ctx);
    expect(config.profiles.default.url).toBe('https://gitlab.example.com/m.git');
  });

  it('writes global scope when --global is given', async () => {
    const ctx = setup();
    const code = await quietAdd(ctx, {
      global: true,
      alias: 'team',
      url: 'https://gitlab.example.com/m.git',
    });
    expect(code).toBe(0);
    const globalPath = join(ctx.env.BAZEL_GIT_LFS_HOME as string, 'config.json');
    const config = JSON.parse(readFileSync(globalPath, 'utf8')) as ConfigFile;
    expect(config.profiles.team).toBeDefined();
    expect(config.profiles.team.url).toBe('https://gitlab.example.com/m.git');
  });

  it('keeps first profile as active; later profiles do not steal active', async () => {
    const ctx = setup();
    await quietAdd(ctx, { url: 'https://gitlab.example.com/a.git' });
    await quietAdd(ctx, { alias: 'team', url: 'https://gitlab.example.com/b.git' });
    const config = await readLocalConfig(ctx);
    expect(config.active).toBe('default');
  });

  it('updates a profile in place preserving createdAt', async () => {
    const ctx = setup();
    await quietAdd(ctx, { url: 'https://gitlab.example.com/a.git' });
    await new Promise((r) => setTimeout(r, 5));
    await quietAdd(ctx, { url: 'https://gitlab.example.com/b.git' });
    const config = await readLocalConfig(ctx);
    const profile = config.profiles.default;
    expect(profile.url).toBe('https://gitlab.example.com/b.git');
    expect(profile.updatedAt).not.toBe(profile.createdAt);
  });

  it('rejects an invalid URL with exit 1', async () => {
    const ctx = setup();
    const code = await quietAdd(ctx, { url: 'not-a-url' });
    expect(code).toBe(1);
  });

  it('rejects an unknown alias with exit 1', async () => {
    const ctx = setup();
    const code = await quietAdd(ctx, { url: '@missing' });
    expect(code).toBe(1);
  });

  it('returns usage error (exit 2) when url is missing', async () => {
    const ctx = setup();
    const code = await quietAdd(ctx, {});
    expect(code).toBe(2);
  });

  it('resolves @alias through the global alias table and stores resolved URL', async () => {
    const ctx = setup();
    const { FsProfileStore } = await import('@/config/store');
    const store = new FsProfileStore();
    const globalPath = join(ctx.env.BAZEL_GIT_LFS_HOME as string, 'config.json');
    await store.writeConfig(globalPath, {
      active: null,
      profiles: {},
      aliases: { company: 'https://gitlab.example.com/bazel/mirror.git' },
    });

    const code = await quietAdd(ctx, { url: '@company' });
    expect(code).toBe(0);
    const config = await readLocalConfig(ctx);
    expect(config.profiles.default.url).toBe('https://gitlab.example.com/bazel/mirror.git');
  });

  it('runs the interactive wizard when stdin is a TTY and url is missing', async () => {
    const ctx = setup();
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const code = await quietAdd(ctx, {});
    expect(code).toBe(0);
    const config = await readLocalConfig(ctx);
    expect(config.profiles.default.url).toBe('git@gitlab.example.com:bazel/mirror.git');

    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
  });

  it('set-default sets the active default for a scope', async () => {
    const ctx = setup();
    await quietAdd(ctx, { url: 'https://gitlab.example.com/a.git' });
    await quietAdd(ctx, { alias: 'team', url: 'https://gitlab.example.com/b.git' });

    const code = await quiet(() =>
      runRemoteSetDefault({ alias: 'team', cwd: ctx.cwd, env: ctx.env }),
    );
    expect(code).toBe(0);
    const config = await readLocalConfig(ctx);
    expect(config.active).toBe('team');
  });

  it('set-default fails for a missing alias', async () => {
    const ctx = setup();
    await quietAdd(ctx, { url: 'https://gitlab.example.com/a.git' });

    const code = await quiet(() =>
      runRemoteSetDefault({ alias: 'missing', cwd: ctx.cwd, env: ctx.env }),
    );
    expect(code).toBe(1);
  });

  it('remove deletes a profile and falls back active to another', async () => {
    const ctx = setup();
    await quietAdd(ctx, { url: 'https://gitlab.example.com/a.git' });
    await quietAdd(ctx, { alias: 'team', url: 'https://gitlab.example.com/b.git' });

    const code = await quiet(() =>
      runRemoteRemove({ alias: 'default', cwd: ctx.cwd, env: ctx.env }),
    );
    expect(code).toBe(0);
    const config = await readLocalConfig(ctx);
    expect(config.profiles.default).toBeUndefined();
    expect(config.active).toBe('team');
  });

  it('remove of the last profile clears active to null', async () => {
    const ctx = setup();
    await quietAdd(ctx, { url: 'https://gitlab.example.com/a.git' });

    const code = await quiet(() =>
      runRemoteRemove({ alias: 'default', cwd: ctx.cwd, env: ctx.env }),
    );
    expect(code).toBe(0);
    const config = await readLocalConfig(ctx);
    expect(config.active).toBeNull();
  });

  it('alias add/list/remove round-trips in the global config', async () => {
    const ctx = setup();
    const addCode = await quiet(() =>
      runRemoteAliasAdd({
        name: 'company',
        url: 'https://gitlab.example.com/mirror.git',
        cwd: ctx.cwd,
        env: ctx.env,
      }),
    );
    expect(addCode).toBe(0);

    const listCode = await quiet(() => runRemoteAliasList({ cwd: ctx.cwd, env: ctx.env }));
    expect(listCode).toBe(0);

    const globalPath = join(ctx.env.BAZEL_GIT_LFS_HOME as string, 'config.json');
    const config = JSON.parse(readFileSync(globalPath, 'utf8')) as ConfigFile;
    expect(config.aliases.company).toBe('https://gitlab.example.com/mirror.git');

    const removeCode = await quiet(() =>
      runRemoteAliasRemove({ name: 'company', cwd: ctx.cwd, env: ctx.env }),
    );
    expect(removeCode).toBe(0);
    const after = JSON.parse(readFileSync(globalPath, 'utf8')) as ConfigFile;
    expect(after.aliases.company).toBeUndefined();
  });

  it('alias add rejects values starting with @', async () => {
    const ctx = setup();
    const code = await quiet(() =>
      runRemoteAliasAdd({ name: 'bad', url: '@other', cwd: ctx.cwd, env: ctx.env }),
    );
    expect(code).toBe(1);
  });

  it('project-local remote add never modifies the global config (SC-006)', async () => {
    const ctx = setup();
    await quietAdd(ctx, { global: true, alias: 'gdev', url: 'https://gitlab.example.com/g.git' });
    const globalBefore = readFileSync(
      join(ctx.env.BAZEL_GIT_LFS_HOME as string, 'config.json'),
      'utf8',
    );

    await quietAdd(ctx, { url: 'https://gitlab.example.com/l.git' });

    const globalAfter = readFileSync(
      join(ctx.env.BAZEL_GIT_LFS_HOME as string, 'config.json'),
      'utf8',
    );
    expect(globalAfter).toBe(globalBefore);
    const localConfig = await readLocalConfig(ctx);
    expect(localConfig.profiles.default.url).toBe('https://gitlab.example.com/l.git');
  });

  it('remote list --json returns both scopes with labels', async () => {
    const ctx = setup();
    await quietAdd(ctx, { url: 'https://gitlab.example.com/l.git' });
    await quietAdd(ctx, { global: true, alias: 'gdev', url: 'https://gitlab.example.com/g.git' });

    let stdout = '';
    const originalOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    };
    const code = await runRemoteList({ cwd: ctx.cwd, env: ctx.env, json: true });
    process.stdout.write = originalOut;

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.profiles).toHaveLength(2);
    const scopes = parsed.profiles.map((p: { scope: string }) => p.scope).sort();
    expect(scopes).toEqual(['global', 'local']);
  });

  it('remote list --effective resolves local over global', async () => {
    const ctx = setup();
    await quietAdd(ctx, { url: 'https://gitlab.example.com/l.git' });
    await quietAdd(ctx, { global: true, url: 'https://gitlab.example.com/g.git' });

    let stdout = '';
    const originalOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    };
    const code = await runRemoteList({
      cwd: ctx.cwd,
      env: ctx.env,
      json: true,
      effective: true,
    });
    process.stdout.write = originalOut;

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.alias).toBe('default');
    expect(parsed.source).toBe('local');
    expect(parsed.url).toBe('https://gitlab.example.com/l.git');
  });

  it('remote list --effective errors when no profile exists in any scope', async () => {
    const ctx = setup();
    let stdout = '';
    const originalOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    };
    const code = await runRemoteList({ cwd: ctx.cwd, env: ctx.env, json: true, effective: true });
    process.stdout.write = originalOut;

    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('No mirror configured');
  });

  it('remote add reports a clean error for a corrupted config file', async () => {
    const ctx = setup();
    const configPath = join(ctx.cwd, '.bazel_git_lfs', 'config.json');
    mkdirSync(join(ctx.cwd, '.bazel_git_lfs'), { recursive: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(configPath, '{ broken json');

    let stdout = '';
    const originalOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    };
    const code = await runRemoteAdd({
      url: 'https://gitlab.example.com/m.git',
      cwd: ctx.cwd,
      env: ctx.env,
      json: true,
    });
    process.stdout.write = originalOut;

    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('corrupted');
  });

  it('remote add reports a clean error when the config directory is not writable', async () => {
    if (process.getuid && process.getuid() === 0) {
      return; // root ignores file permissions
    }
    const ctx = setup();
    const configDir = join(ctx.cwd, '.bazel_git_lfs');
    mkdirSync(configDir, { recursive: true });
    const { chmodSync } = await import('node:fs');
    chmodSync(configDir, 0o555);

    let stdout = '';
    const originalOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown): boolean => {
      stdout += String(chunk);
      return true;
    };
    const code = await runRemoteAdd({
      url: 'https://gitlab.example.com/m.git',
      cwd: ctx.cwd,
      env: ctx.env,
      json: true,
    });
    process.stdout.write = originalOut;

    chmodSync(configDir, 0o755);

    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('Cannot save config');
  });
});
