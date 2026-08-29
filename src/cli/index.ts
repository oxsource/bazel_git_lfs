#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(__filename);
const pkg = nodeRequire('../../package.json') as { version: string };

const program = new Command();

program
  .name('bazel-git-lfs')
  .description(
    'Discover, cache, and mirror Bazel remote HTTP dependencies into a shared Git LFS repository',
  )
  .version(pkg.version);

export function run(argv: string[]): void {
  program.parse(argv);
}

if (require.main === module) {
  run(process.argv);
}
