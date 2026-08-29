import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Profile, isValidAlias, isValidGitUrl } from '@/config/profile';
import { COMMANDS, TOOL_NAME } from '@/config/constants';

export interface ConfigFile {
  active: string | null;
  profiles: Record<string, Profile>;
  aliases: Record<string, string>;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ProfileStore {
  readConfig(configPath: string): Promise<ConfigFile>;
  writeConfig(configPath: string, config: ConfigFile): Promise<void>;
}

export class FsProfileStore implements ProfileStore {
  async readConfig(configPath: string): Promise<ConfigFile> {
    let raw: string;
    try {
      raw = await readFile(configPath, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return { active: null, profiles: {}, aliases: {} };
      }
      throw new ConfigError(`Cannot read config file at ${configPath}: ${(err as Error).message}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ConfigError(
        `Config file at ${configPath} is corrupted (invalid JSON). Re-run "${TOOL_NAME} ${COMMANDS.INIT}" to recreate it.`,
      );
    }

    return validateConfigFile(parsed, configPath);
  }

  async writeConfig(configPath: string, config: ConfigFile): Promise<void> {
    const dir = dirname(configPath);
    await mkdir(dir, { recursive: true });

    const tmpPath = `${configPath}.${process.pid}.tmp`;
    await writeFile(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    await rename(tmpPath, configPath);
  }
}

function validateConfigFile(parsed: unknown, configPath: string): ConfigFile {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`Config file at ${configPath} has an invalid structure.`);
  }

  const record = parsed as Record<string, unknown>;
  const profiles: Record<string, Profile> = {};
  const rawProfiles = record.profiles;
  if (rawProfiles !== undefined) {
    if (typeof rawProfiles !== 'object' || rawProfiles === null || Array.isArray(rawProfiles)) {
      throw new ConfigError(`Config file at ${configPath} has invalid "profiles".`);
    }
    for (const [alias, value] of Object.entries(rawProfiles)) {
      profiles[alias] = validateProfile(alias, value, configPath);
    }
  }

  const aliases: Record<string, string> = {};
  const rawAliases = record.aliases;
  if (rawAliases !== undefined) {
    if (typeof rawAliases !== 'object' || rawAliases === null || Array.isArray(rawAliases)) {
      throw new ConfigError(`Config file at ${configPath} has invalid "aliases".`);
    }
    for (const [name, value] of Object.entries(rawAliases)) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ConfigError(`Config file at ${configPath} has an invalid alias "${name}".`);
      }
      aliases[name] = value;
    }
  }

  let active: string | null = null;
  if (record.active !== undefined && record.active !== null) {
    if (typeof record.active !== 'string') {
      throw new ConfigError(`Config file at ${configPath} has an invalid "active" value.`);
    }
    active = record.active;
  }
  if (active !== null && !(active in profiles)) {
    active = null;
  }

  return { active, profiles, aliases };
}

function validateProfile(alias: string, value: unknown, configPath: string): Profile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`Config file at ${configPath} has an invalid profile "${alias}".`);
  }

  if (!isValidAlias(alias)) {
    throw new ConfigError(
      `Config file at ${configPath} has an invalid alias "${alias}" (allowed: letters, digits, . _ -).`,
    );
  }

  const record = value as Record<string, unknown>;
  if (typeof record.url !== 'string' || !isValidGitUrl(record.url)) {
    throw new ConfigError(`Profile "${alias}" in ${configPath} has an invalid url.`);
  }

  return {
    alias,
    url: record.url,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  };
}
