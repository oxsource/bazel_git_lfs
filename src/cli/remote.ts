import { FsProfileStore, ConfigError, ConfigFile } from '@/config/store';
import { FsAliasManager } from '@/config/alias';
import { resolveScope, Scope } from '@/config/scope';
import { profile } from '@/config/profile';
import { assertNotReserved, RESERVED_ALIASES } from '@/mirror/alias';
import {
  format,
  OutputOptions,
  EXIT_OK,
  EXIT_ERROR,
  EXIT_USAGE,
} from '@/cli/format';
import { COMMANDS, REMOTE_SUBCOMMANDS, TOOL_NAME } from '@/config/constants';

export interface RemoteAddOptions extends OutputOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  global?: boolean;
  alias?: string;
  url?: string;
}

export interface RemoteDefaultOptions extends OutputOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  global?: boolean;
  alias: string;
}

export interface RemoteRemoveOptions extends OutputOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  global?: boolean;
  alias: string;
}

export interface RemoteListOptions extends OutputOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  global?: boolean;
  effective?: boolean;
}

export interface RemoteAliasAddOptions extends OutputOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  name: string;
  url: string;
}

export interface RemoteAliasRemoveOptions extends OutputOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  name: string;
}

export interface RemoteAliasListOptions extends OutputOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_ALIAS = RESERVED_ALIASES.DEFAULT;

async function readConfigSafe(
  store: FsProfileStore,
  path: string,
  opts: OutputOptions,
): Promise<ConfigFile | null> {
  try {
    return await store.readConfig(path);
  } catch (err) {
    if (err instanceof ConfigError) {
      format.printError(err.message, opts);
      return null;
    }
    throw err;
  }
}

export async function runRemoteAdd(opts: RemoteAddOptions): Promise<number> {
  const env = opts.env ?? process.env;
  const scope: Scope = opts.global ? 'global' : 'local';
  const { configPath } = resolveScope(scope, opts.cwd, env);
  const store = new FsProfileStore();
  const aliases = new FsAliasManager();
  const { paths } = await import('@/config/paths');

  const alias = opts.alias ?? DEFAULT_ALIAS;
  if (!profile.isValidAlias(alias)) {
    format.printUsageError(`Invalid alias "${alias}" (allowed: letters, digits, . _ -).`, opts);
    return EXIT_USAGE;
  }

  try {
    assertNotReserved(alias);
  } catch (err) {
    format.printUsageError((err as Error).message, opts);
    return EXIT_USAGE;
  }

  let config = await readConfigSafe(store, configPath, opts);
  if (config === null) {
    return EXIT_ERROR;
  }
  const globalConfig = await readConfigSafe(store, paths.globalConfigFile(env), opts);
  if (globalConfig === null) {
    return EXIT_ERROR;
  }

  let url = opts.url;

  const wantInteractive = isTty() && url === undefined;

  if (wantInteractive) {
    try {
      const answers = await runWizard();
      url = answers.url;
    } catch (err) {
      const error = err as { isCanceled?: boolean };
      if (error.isCanceled) {
        format.printError('Initialization canceled; nothing was written.', opts, 130);
        return 130;
      }
      format.printError(`Wizard failed: ${(err as Error).message}`, opts);
      return EXIT_ERROR;
    }
  }

  if (url === undefined || url.trim().length === 0) {
    format.printUsageError('Missing required value: --url <url>', opts);
    return EXIT_USAGE;
  }

  try {
    const resolved = aliases.resolveUrl(url, globalConfig);
    url = resolved.url;
  } catch (err) {
    if (err instanceof ConfigError) {
      format.printError(err.message, opts);
      return EXIT_ERROR;
    }
    throw err;
  }

  if (!profile.isValidGitUrl(url)) {
    format.printError(`Invalid mirror repository URL "${url}" (expected HTTP(S) or SSH git URL).`, opts);
    return EXIT_ERROR;
  }

  config = upsertProfile(config, alias, url);

  try {
    await store.writeConfig(configPath, config);
  } catch (err) {
    format.printError(`Cannot save config to ${configPath}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  format.printResult(
    {
      ok: true,
      alias,
      scope,
      configPath,
      active: config.active,
      message: `Saved mirror profile "${alias}" (${scope}) at ${configPath}`,
    },
    opts,
  );
  return EXIT_OK;
}

export async function runRemoteSetDefault(opts: RemoteDefaultOptions): Promise<number> {
  const env = opts.env ?? process.env;
  const scope: Scope = opts.global ? 'global' : 'local';
  const { configPath } = resolveScope(scope, opts.cwd, env);
  const store = new FsProfileStore();

  if (!profile.isValidAlias(opts.alias)) {
    format.printUsageError(`Invalid alias "${opts.alias}" (allowed: letters, digits, . _ -).`, opts);
    return EXIT_USAGE;
  }

  const config = await readConfigSafe(store, configPath, opts);
  if (config === null) {
    return EXIT_ERROR;
  }
  if (!config.profiles[opts.alias]) {
    format.printError(`Alias "${opts.alias}" does not exist in the ${scope} scope.`, opts);
    return EXIT_ERROR;
  }

  const updated = { ...config, active: opts.alias };

  try {
    await store.writeConfig(configPath, updated);
  } catch (err) {
    format.printError(`Cannot save config to ${configPath}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  format.printResult(
    {
      ok: true,
      alias: opts.alias,
      scope,
      configPath,
      message: `Set active default profile to "${opts.alias}" (${scope}).`,
    },
    opts,
  );
  return EXIT_OK;
}

export async function runRemoteRemove(opts: RemoteRemoveOptions): Promise<number> {
  const env = opts.env ?? process.env;
  const scope: Scope = opts.global ? 'global' : 'local';
  const { configPath } = resolveScope(scope, opts.cwd, env);
  const store = new FsProfileStore();

  const config = await readConfigSafe(store, configPath, opts);
  if (config === null) {
    return EXIT_ERROR;
  }
  if (!config.profiles[opts.alias]) {
    format.printError(`Alias "${opts.alias}" does not exist in the ${scope} scope.`, opts);
    return EXIT_ERROR;
  }

  const profiles = { ...config.profiles };
  delete profiles[opts.alias];

  let active = config.active;
  if (active === opts.alias) {
    const remaining = Object.keys(profiles);
    active = remaining.length > 0 ? remaining[0] : null;
  }

  const updated = { active, profiles, aliases: config.aliases };

  try {
    await store.writeConfig(configPath, updated);
  } catch (err) {
    format.printError(`Cannot save config to ${configPath}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  format.printResult(
    {
      ok: true,
      alias: opts.alias,
      scope,
      configPath,
      active,
      message: `Removed mirror profile "${opts.alias}" (${scope}).`,
    },
    opts,
  );
  return EXIT_OK;
}

export async function runRemoteList(opts: RemoteListOptions): Promise<number> {
  const env = opts.env ?? process.env;
  const store = new FsProfileStore();
  const { paths } = await import('@/config/paths');

  const localPath = paths.projectConfigFile(opts.cwd);
  const globalPath = paths.globalConfigFile(env);

  const localConfig = await readConfigSafe(store, localPath, opts);
  if (localConfig === null) {
    return EXIT_ERROR;
  }
  const globalConfig = await readConfigSafe(store, globalPath, opts);
  if (globalConfig === null) {
    return EXIT_ERROR;
  }

  if (opts.effective) {
    const { ConfigResolver } = await import('@/config/resolve');
    const resolver = new ConfigResolver(store);
    try {
      const effective = await resolver.resolveEffective({ cwd: opts.cwd, env });
      if (opts.json) {
        format.printResult(
          {
            ok: true,
            effective: true,
            alias: effective.alias,
            source: effective.source,
            url: effective.profile.url,
            values: {
              url: { value: effective.values.url.value, source: effective.values.url.source },
            },
          },
          opts,
        );
      } else {
        process.stdout.write(
          `  ${effective.alias} (${effective.source}) [active] → ${effective.profile.url}\n`,
        );
      }
    } catch (err) {
      if (err instanceof ConfigError) {
        format.printError(err.message, opts);
        return EXIT_ERROR;
      }
      throw err;
    }
    return EXIT_OK;
  }

  const localEntries = Object.values(localConfig.profiles).map((p) => ({
    alias: p.alias,
    url: p.url,
    scope: 'local',
    active: localConfig.active === p.alias,
  }));
  const globalEntries = Object.values(globalConfig.profiles).map((p) => ({
    alias: p.alias,
    url: p.url,
    scope: 'global',
    active: globalConfig.active === p.alias,
  }));

  const entries = opts.global ? globalEntries : [...localEntries, ...globalEntries];

  if (opts.json) {
    format.printResult({ ok: true, profiles: entries }, opts);
  } else {
    if (entries.length === 0) {
      process.stdout.write(
        'No mirror profiles configured. Run "' + TOOL_NAME + ' ' + COMMANDS.REMOTE + ' ' + REMOTE_SUBCOMMANDS.ADD + '" first.\n',
      );
      return EXIT_OK;
    }
    for (const e of entries) {
      const activeMark = e.active ? ' [active]' : '';
      process.stdout.write(`  ${e.alias} (${e.scope})${activeMark} → ${e.url}\n`);
    }
  }
  return EXIT_OK;
}

export async function runRemoteAliasAdd(opts: RemoteAliasAddOptions): Promise<number> {
  const env = opts.env ?? process.env;
  const { paths } = await import('@/config/paths');
  const store = new FsProfileStore();
  const aliases = new FsAliasManager();

  const configPath = paths.globalConfigFile(env);
  const config = await readConfigSafe(store, configPath, opts);
  if (config === null) {
    return EXIT_ERROR;
  }

  let next: ConfigFile;
  try {
    assertNotReserved(opts.name);
  } catch (err) {
    format.printUsageError((err as Error).message, opts);
    return EXIT_USAGE;
  }
  try {
    next = aliases.add(config, opts.name, opts.url);
  } catch (err) {
    if (err instanceof ConfigError) {
      format.printError(err.message, opts);
      return EXIT_ERROR;
    }
    throw err;
  }

  try {
    await store.writeConfig(configPath, next);
  } catch (err) {
    format.printError(`Cannot save config to ${configPath}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  format.printResult(
    {
      ok: true,
      name: opts.name,
      url: opts.url,
      configPath,
      message: `Saved global mirror alias "${opts.name}" → ${opts.url}`,
    },
    opts,
  );
  return EXIT_OK;
}

export async function runRemoteAliasList(opts: RemoteAliasListOptions): Promise<number> {
  const env = opts.env ?? process.env;
  const { paths } = await import('@/config/paths');
  const store = new FsProfileStore();
  const aliases = new FsAliasManager();

  const configPath = paths.globalConfigFile(env);
  const config = await readConfigSafe(store, configPath, opts);
  if (config === null) {
    return EXIT_ERROR;
  }
  const list = aliases.list(config);

  format.printResult({ ok: true, aliases: list, configPath }, opts);
  return EXIT_OK;
}

export async function runRemoteAliasRemove(opts: RemoteAliasRemoveOptions): Promise<number> {
  const env = opts.env ?? process.env;
  const { paths } = await import('@/config/paths');
  const store = new FsProfileStore();
  const aliases = new FsAliasManager();

  const configPath = paths.globalConfigFile(env);
  const config = await readConfigSafe(store, configPath, opts);
  if (config === null) {
    return EXIT_ERROR;
  }

  const next = aliases.remove(config, opts.name);

  try {
    await store.writeConfig(configPath, next);
  } catch (err) {
    format.printError(`Cannot save config to ${configPath}: ${(err as Error).message}`, opts);
    return EXIT_ERROR;
  }

  format.printResult(
    {
      ok: true,
      name: opts.name,
      configPath,
      message: `Removed global mirror alias "${opts.name}".`,
    },
    opts,
  );
  return EXIT_OK;
}

function upsertProfile(config: ConfigFile, alias: string, url: string): ConfigFile {
  const now = new Date().toISOString();
  const existing = config.profiles[alias];
  const profiles = {
    ...config.profiles,
    [alias]: {
      alias,
      url,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
  };

  let active = config.active;
  if (active === null) {
    active = alias;
  } else if (active === alias) {
    active = alias;
  }

  return { active, profiles, aliases: config.aliases };
}

interface WizardAnswers {
  url: string;
}

async function runWizard(): Promise<WizardAnswers> {
  const { default: prompts } = await import('prompts');
  const response = await prompts([
    {
      type: 'text',
      name: 'url',
      message: 'Mirror repository URL (e.g., git@gitlab.example.com:bazel/mirror.git or @alias):',
      validate: (value: string) =>
        value && value.trim().length > 0 ? true : 'Mirror repository URL is required',
    },
  ]);
  return response as WizardAnswers;
}

function isTty(): boolean {
  try {
    return Boolean(process.stdin.isTTY);
  } catch {
    return false;
  }
}
