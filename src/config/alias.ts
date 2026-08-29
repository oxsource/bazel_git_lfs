import { ConfigFile, ConfigError } from './store';

const ALIAS_TOKEN = '@';

export interface AliasManager {
  add(config: ConfigFile, name: string, url: string): ConfigFile;
  list(config: ConfigFile): Record<string, string>;
  remove(config: ConfigFile, name: string): ConfigFile;
  resolveUrl(input: string, config: ConfigFile): { url: string; viaAlias: string | null };
}

export class FsAliasManager implements AliasManager {
  add(config: ConfigFile, name: string, url: string): ConfigFile {
    if (!name || name.trim().length === 0) {
      throw new ConfigError('Alias name cannot be empty.');
    }
    if (url.startsWith(ALIAS_TOKEN)) {
      throw new ConfigError(
        `Alias value for "${name}" cannot start with "@" (single-level resolution only, no chained aliases).`,
      );
    }
    return {
      ...config,
      aliases: { ...config.aliases, [name]: url },
    };
  }

  list(config: ConfigFile): Record<string, string> {
    return { ...config.aliases };
  }

  remove(config: ConfigFile, name: string): ConfigFile {
    const aliases = { ...config.aliases };
    delete aliases[name];
    return { ...config, aliases };
  }

  resolveUrl(input: string, config: ConfigFile): { url: string; viaAlias: string | null } {
    if (!input.startsWith(ALIAS_TOKEN)) {
      return { url: input, viaAlias: null };
    }
    const name = input.slice(ALIAS_TOKEN.length);
    const resolved = config.aliases[name];
    if (resolved === undefined) {
      throw new ConfigError(
        `Unknown mirror alias "${name}". Define it first with "bazel-git-lfs remote alias add ${name} <url>".`,
      );
    }
    return { url: resolved, viaAlias: name };
  }
}
