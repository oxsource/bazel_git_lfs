export const COMMANDS = {
  INIT: 'init',
  INSPECT: 'inspect',
  FETCH: 'fetch',
  PUSH: 'push',
  PULL: 'pull',
  STATUS: 'status',
  CLEAN: 'clean',
  CHECKOUT: 'checkout',
  REMOTE: 'remote',
  COMPLETION: 'completion',
} as const;

export const REMOTE_SUBCOMMANDS = {
  ADD: 'add',
  SET_DEFAULT: 'set-default',
  REMOVE: 'remove',
  LIST: 'list',
  ALIAS: 'alias',
} as const;

export const ALIAS_SUBCOMMANDS = {
  ADD: 'add',
  LIST: 'list',
  REMOVE: 'remove',
} as const;

export const SCOPE = {
  LOCAL: 'local' as const,
  GLOBAL: 'global' as const,
};

export const TOOL_NAME = 'bazel-git-lfs';

export const DIRS = {
  OBJECTS: 'objects',
  MIRROR: 'mirror',
};

export const FILES = {
  MANIFEST: 'manifest.json',
  CHECKOUT_STATE: 'checkout-state.json',
  GIT_ATTRIBUTES: '.gitattributes',
};

export const BAZEL_FILES = ['WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel'] as const;

export const LFS_PATTERNS = {
  OBJECTS_TRACK: 'objects/**',
};

export const GIT = {
  DEFAULT_REMOTE: 'origin',
  DEFAULT_BRANCH: 'main',
};

export const ARCHIVE_SUFFIXES = ['.tar.gz', '.tgz', '.tar.bz2', '.tar.xz', '.zip', '.tar'] as const;

export const COMMIT_MESSAGES = {
  MIRROR_PUSH: 'bazel-git-lfs: mirror dependencies',
  UPDATE_MANIFEST: 'bazel-git-lfs: update manifest',
} as const;