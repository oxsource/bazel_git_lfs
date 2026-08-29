import { ConfigError, ProfileStore, ConfigFile } from '@/config/store';
import { COMMANDS, REMOTE_SUBCOMMANDS, TOOL_NAME } from '@/config/constants';

export interface ResolveOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedProfile {
  profile: NonNullable<ConfigFile['profiles'][string]>;
  alias: string;
  scope: 'local' | 'global';
}

export interface EffectiveResolution {
  profile: NonNullable<ConfigFile['profiles'][string]>;
  alias: string;
  source: 'local' | 'global';
  values: { url: { value: string; source: 'local' | 'global' } };
}

export class ConfigResolver {
  constructor(private readonly store: ProfileStore) {}

  async resolve(opts: ResolveOptions): Promise<ResolvedProfile> {
    const { cwd, env = process.env } = opts;
    const { projectConfigFile, globalConfigFile } = await import('@/config/paths');

    const localConfig = await this.store.readConfig(projectConfigFile(cwd));
    const globalConfig = await this.store.readConfig(globalConfigFile(env));

    return this.pick(localConfig, globalConfig);
  }

  async resolveEffective(opts: ResolveOptions): Promise<EffectiveResolution> {
    const { cwd, env = process.env } = opts;
    const { projectConfigFile, globalConfigFile } = await import('@/config/paths');

    const localConfig = await this.store.readConfig(projectConfigFile(cwd));
    const globalConfig = await this.store.readConfig(globalConfigFile(env));

    const candidateAlias = localConfig.active ?? globalConfig.active;
    if (candidateAlias === null) {
      throw new ConfigError(
        `No mirror configured. Run "${TOOL_NAME} ${COMMANDS.INIT}" and "${TOOL_NAME} ${COMMANDS.REMOTE} ${REMOTE_SUBCOMMANDS.ADD}" first.`,
      );
    }

    const localProfile = localConfig.profiles[candidateAlias];
    const globalProfile = globalConfig.profiles[candidateAlias];

    if (!localProfile && !globalProfile) {
      throw new ConfigError(
        `Alias "${candidateAlias}" does not exist. Known aliases: ${
          this.knownAliases(localConfig, globalConfig).join(', ') || 'none'
        }.`,
      );
    }

    const url = localProfile?.url ?? globalProfile?.url ?? '';

    return {
      profile: {
        alias: candidateAlias,
        url,
        createdAt: localProfile?.createdAt ?? globalProfile?.createdAt ?? new Date().toISOString(),
        updatedAt: localProfile?.updatedAt ?? globalProfile?.updatedAt ?? new Date().toISOString(),
      },
      alias: candidateAlias,
      source: localProfile ? 'local' : 'global',
      values: {
        url: { value: url, source: localProfile ? 'local' : 'global' },
      },
    };
  }

  private pick(localConfig: ConfigFile, globalConfig: ConfigFile): ResolvedProfile {
    const candidateAlias = localConfig.active ?? globalConfig.active;
    if (candidateAlias === null) {
      throw new ConfigError(
        `No mirror configured. Run "${TOOL_NAME} ${COMMANDS.INIT}" and "${TOOL_NAME} ${COMMANDS.REMOTE} ${REMOTE_SUBCOMMANDS.ADD}" first.`,
      );
    }

    const localProfile = localConfig.profiles[candidateAlias];
    if (localProfile) {
      return { profile: localProfile, alias: candidateAlias, scope: 'local' };
    }

    const globalProfile = globalConfig.profiles[candidateAlias];
    if (globalProfile) {
      return { profile: globalProfile, alias: candidateAlias, scope: 'global' };
    }

    throw new ConfigError(
      `Alias "${candidateAlias}" does not exist. Known aliases: ${
        this.knownAliases(localConfig, globalConfig).join(', ') || 'none'
      }.`,
    );
  }

  private knownAliases(localConfig: ConfigFile, globalConfig: ConfigFile): string[] {
    const set = new Set<string>([
      ...Object.keys(localConfig.profiles),
      ...Object.keys(globalConfig.profiles),
    ]);
    return [...set];
  }
}
