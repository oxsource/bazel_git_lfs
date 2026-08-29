import { ConfigError, ProfileStore, ConfigFile } from './store';
import { projectConfigFile, globalConfigFile } from './paths';

export interface ResolveOptions {
  namespace?: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedProfile {
  profile: NonNullable<ConfigFile['profiles'][string]>;
  namespace: string;
  scope: 'local' | 'global';
}

export interface EffectiveResolution {
  profile: NonNullable<ConfigFile['profiles'][string]>;
  namespace: string;
  source: 'local' | 'global';
  values: Record<
    'mirrorRepoUrl' | 'gitLabHost' | 'lfsEnabled',
    { value: unknown; source: 'local' | 'global' }
  >;
}

export class ConfigResolver {
  constructor(private readonly store: ProfileStore) {}

  async resolve(opts: ResolveOptions): Promise<ResolvedProfile> {
    const { namespace, cwd, env = process.env } = opts;

    const localConfig = await this.store.readConfig(projectConfigFile(cwd));
    const globalConfig = await this.store.readConfig(globalConfigFile(env));

    return this.pick(localConfig, globalConfig, namespace);
  }

  async resolveEffective(opts: ResolveOptions): Promise<EffectiveResolution> {
    const { namespace, cwd, env = process.env } = opts;

    const localConfig = await this.store.readConfig(projectConfigFile(cwd));
    const globalConfig = await this.store.readConfig(globalConfigFile(env));

    const candidateNamespace = namespace ?? localConfig.active ?? globalConfig.active;
    if (candidateNamespace === null) {
      throw new ConfigError(
        'No mirror configured. Run "bazel-git-lfs init" and "bazel-git-lfs remote add" first.',
      );
    }

    const localProfile = localConfig.profiles[candidateNamespace];
    const globalProfile = globalConfig.profiles[candidateNamespace];

    if (!localProfile && !globalProfile) {
      throw new ConfigError(
        `Namespace "${candidateNamespace}" does not exist. Known namespaces: ${
          this.knownNamespaces(localConfig, globalConfig).join(', ') || 'none'
        }.`,
      );
    }

    const merged = {
      mirrorRepoUrl: localProfile?.mirrorRepoUrl ?? globalProfile?.mirrorRepoUrl ?? '',
      gitLabHost: localProfile?.gitLabHost ?? globalProfile?.gitLabHost ?? '',
      lfsEnabled: localProfile?.lfsEnabled ?? globalProfile?.lfsEnabled ?? true,
    };

    return {
      profile: {
        namespace: candidateNamespace,
        ...merged,
        createdAt: localProfile?.createdAt ?? globalProfile?.createdAt ?? new Date().toISOString(),
        updatedAt: localProfile?.updatedAt ?? globalProfile?.updatedAt ?? new Date().toISOString(),
      },
      namespace: candidateNamespace,
      source: localProfile ? 'local' : 'global',
      values: {
        mirrorRepoUrl: { value: merged.mirrorRepoUrl, source: localProfile ? 'local' : 'global' },
        gitLabHost: { value: merged.gitLabHost, source: localProfile ? 'local' : 'global' },
        lfsEnabled: { value: merged.lfsEnabled, source: localProfile ? 'local' : 'global' },
      },
    };
  }

  private pick(
    localConfig: ConfigFile,
    globalConfig: ConfigFile,
    namespace: string | undefined,
  ): ResolvedProfile {
    const candidateNamespace = namespace ?? localConfig.active ?? globalConfig.active;
    if (candidateNamespace === null) {
      throw new ConfigError(
        'No mirror configured. Run "bazel-git-lfs init" and "bazel-git-lfs remote add" first.',
      );
    }

    const localProfile = localConfig.profiles[candidateNamespace];
    if (localProfile) {
      return { profile: localProfile, namespace: candidateNamespace, scope: 'local' };
    }

    const globalProfile = globalConfig.profiles[candidateNamespace];
    if (globalProfile) {
      return { profile: globalProfile, namespace: candidateNamespace, scope: 'global' };
    }

    throw new ConfigError(
      `Namespace "${candidateNamespace}" does not exist. Known namespaces: ${
        this.knownNamespaces(localConfig, globalConfig).join(', ') || 'none'
      }.`,
    );
  }

  private knownNamespaces(localConfig: ConfigFile, globalConfig: ConfigFile): string[] {
    const set = new Set<string>([
      ...Object.keys(localConfig.profiles),
      ...Object.keys(globalConfig.profiles),
    ]);
    return [...set];
  }
}
