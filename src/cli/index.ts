#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { runInit } from './init';
import { printUsageError, OutputOptions } from './format';

const nodeRequire = createRequire(__filename);
const pkg = nodeRequire('../../package.json') as { version: string };

const STUB_COMMANDS = ['scan', 'sync', 'verify', 'list', 'search', 'rewrite'] as const;

export interface CliDeps {
  cwd?: string;
}

export function buildProgram(deps: CliDeps = {}): Command {
  const program = new Command();
  const cwd = deps.cwd ?? process.cwd();

  program
    .name('bazel-git-lfs')
    .description(
      'Discover, cache, and mirror Bazel remote HTTP dependencies into a shared Git LFS repository',
    )
    .version(pkg.version)
    .exitOverride();

  program
    .command('init')
    .description('Initialize a non-versioned .bazel_git_lfs config area in the current project')
    .option('--json', 'output machine-readable JSON')
    .action(async (options: OutputOptions) => {
      const code = await runInit({ json: Boolean(options.json), cwd });
      if (code !== 0) {
        process.exitCode = code;
      }
    });

  for (const name of STUB_COMMANDS) {
    program
      .command(name)
      .description(`[not implemented in this stage] ${name}`)
      .option('--json', 'output machine-readable JSON')
      .allowUnknownOption(true)
      .action((options: OutputOptions) => {
        const msg = `"${name}" is not implemented in this stage.`;
        if (options.json) {
          process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
        } else {
          process.stderr.write(`error: ${msg}\n`);
        }
        process.exitCode = 1;
      });
  }

  return program;
}

export function run(argv: string[]): void {
  const program = buildProgram();
  try {
    program.parse(argv);
  } catch (err) {
    const error = err as { code?: string; message?: string };
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
      return;
    }
    printUsageError(error.message ?? 'Unknown error');
  }
}

if (require.main === module) {
  run(process.argv);
}
