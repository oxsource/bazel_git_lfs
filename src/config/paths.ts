import { join } from 'node:path';

export const CONFIG_DIR_NAME = '.bazel_git_lfs';

function projectConfigDir(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME);
}

export const paths = { projectConfigDir };
