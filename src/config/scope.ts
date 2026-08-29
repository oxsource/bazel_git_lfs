import { projectConfigFile, globalConfigFile } from '@/config/paths';

export type Scope = 'local' | 'global';

export interface ScopeContext {
  scope: Scope;
  configPath: string;
}

export function scopeConfigPath(
  scope: Scope,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (scope === 'global') {
    return globalConfigFile(env);
  }
  return projectConfigFile(cwd);
}

export function resolveScope(
  scopeFlag: Scope | undefined,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): ScopeContext {
  const scope = scopeFlag ?? 'local';
  return {
    scope,
    configPath: scopeConfigPath(scope, cwd, env),
  };
}
