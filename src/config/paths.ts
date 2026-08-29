import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR_NAME = '.bazel_git_lfs';
export const CONFIG_FILE_NAME = 'config.json';

export const GLOBAL_CONFIG_DIR_ENV = 'BAZEL_GIT_LFS_HOME';

export function globalConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[GLOBAL_CONFIG_DIR_ENV];
  if (override && override.trim().length > 0) {
    return override;
  }
  return join(homedir(), CONFIG_DIR_NAME);
}

export function globalConfigFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(globalConfigDir(env), CONFIG_FILE_NAME);
}

export function projectConfigDir(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME);
}

export function projectConfigFile(cwd: string): string {
  return join(projectConfigDir(cwd), CONFIG_FILE_NAME);
}
