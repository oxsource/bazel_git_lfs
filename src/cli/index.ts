#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '@/cli/init';
import { runInspect } from '@/cli/inspect';
import { runFetchCommand } from '@/cli/fetch';
import { runPushCommand } from '@/cli/push';
import {
  runRemoteAdd,
  runRemoteSetDefault,
  runRemoteRemove,
  runRemoteList,
  runRemoteAliasAdd,
  runRemoteAliasList,
  runRemoteAliasRemove,
} from '@/cli/remote';
import { printUsageError, OutputOptions } from '@/cli/format';

const VERSION: string = __BGL_VERSION__;

const STUB_COMMANDS = ['sync', 'verify', 'list', 'search', 'rewrite'] as const;

export interface CliDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function buildProgram(deps: CliDeps = {}): Command {
  const program = new Command();
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;

  program
    .name('bazel-git-lfs')
    .description(
      'Discover and mirror Bazel remote HTTP dependencies into a shared Git LFS repository',
    )
    .version(VERSION)
    .exitOverride()
    .configureOutput({ writeErr: () => {} });

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

  program
    .command('inspect')
    .description(
      'Discover the current project\u2019s remote HTTP dependencies and persist the snapshot (JSON)',
    )
    .allowExcessArguments(false)
    .action(async () => {
      const code = await runInspect({ cwd });
      if (code !== 0) {
        process.exitCode = code;
      }
    });

  program
    .command('fetch')
    .description(
      'Download snapshot dependencies from their source URLs into the local objects store (JSON)',
    )
    .allowExcessArguments(false)
    .action(async () => {
      const code = await runFetchCommand({ cwd });
      if (code !== 0) {
        process.exitCode = code;
      }
    });

  program
    .command('push')
    .description(
      'Upload local objects to the configured Git LFS mirror, update the manifest, commit and push (JSON)',
    )
    .allowExcessArguments(false)
    .action(async () => {
      const code = await runPushCommand({ cwd, env });
      if (code !== 0) {
        process.exitCode = code;
      }
    });

  const remote = program.command('remote').description('Manage mirror-repository profiles');
  remote
    .command('add')
    .description('Add or update a mirror profile')
    .option('--global', 'write to the global (user home) config instead of project-local')
    .option('--alias <name>', `profile alias (default: ${'default'})`)
    .option('--url <url>', 'mirror repository URL (may be @alias)')
    .option('--json', 'output machine-readable JSON')
    .action(async (options: RemoteAddCliOptions) => {
      const code = await runRemoteAdd({
        json: Boolean(options.json),
        global: Boolean(options.global),
        alias: options.alias,
        url: options.url,
        cwd,
        env,
      });
      if (code !== 0) {
        process.exitCode = code;
      }
    });

  remote
    .command('set-default')
    .description('Set the active default profile in the selected scope')
    .argument('<alias>', 'profile alias')
    .option('--global', 'target the global (user home) config')
    .option('--json', 'output machine-readable JSON')
    .action(async (alias: string, options: RemoteTargetCliOptions) => {
      const code = await runRemoteSetDefault({
        json: Boolean(options.json),
        global: Boolean(options.global),
        alias,
        cwd,
        env,
      });
      if (code !== 0) {
        process.exitCode = code;
      }
    });

  remote
    .command('remove')
    .description('Remove a mirror profile from the selected scope')
    .argument('<alias>', 'profile alias')
    .option('--global', 'target the global (user home) config')
    .option('--json', 'output machine-readable JSON')
    .action(async (alias: string, options: RemoteTargetCliOptions) => {
      const code = await runRemoteRemove({
        json: Boolean(options.json),
        global: Boolean(options.global),
        alias,
        cwd,
        env,
      });
      if (code !== 0) {
        process.exitCode = code;
      }
    });

  remote
    .command('list')
    .description('List mirror profiles (project-local + global, or with --global only global)')
    .option('--global', 'list only the global (user home) config')
    .option('--effective', 'show the merged, actually-in-effect profile')
    .option('--json', 'output machine-readable JSON')
    .action(async (options: RemoteListCliOptions) => {
      const code = await runRemoteList({
        json: Boolean(options.json),
        global: Boolean(options.global),
        effective: Boolean(options.effective),
        cwd,
        env,
      });
      if (code !== 0) {
        process.exitCode = code;
      }
    });

  const alias = remote.command('alias').description('Manage the global mirror URL alias table');
  alias
    .command('add')
    .description('Add or update a global mirror alias')
    .argument('<name>', 'alias name')
    .argument('<url>', 'mirror repository URL')
    .option('--json', 'output machine-readable JSON')
    .action(async (name: string, url: string, options: OutputOptions) => {
      const code = await runRemoteAliasAdd({ json: Boolean(options.json), name, url, cwd, env });
      if (code !== 0) {
        process.exitCode = code;
      }
    });
  alias
    .command('list')
    .description('List all global mirror aliases')
    .option('--json', 'output machine-readable JSON')
    .action(async (options: OutputOptions) => {
      const code = await runRemoteAliasList({ json: Boolean(options.json), cwd, env });
      if (code !== 0) {
        process.exitCode = code;
      }
    });
  alias
    .command('remove')
    .description('Remove a global mirror alias')
    .argument('<name>', 'alias name')
    .option('--json', 'output machine-readable JSON')
    .action(async (name: string, options: OutputOptions) => {
      const code = await runRemoteAliasRemove({ json: Boolean(options.json), name, cwd, env });
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

interface RemoteAddCliOptions extends OutputOptions {
  global?: boolean;
  alias?: string;
  url?: string;
}

interface RemoteTargetCliOptions extends OutputOptions {
  global?: boolean;
}

interface RemoteListCliOptions extends OutputOptions {
  global?: boolean;
  effective?: boolean;
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
    const message = (error.message ?? 'Unknown error').replace(/^error: /, '');
    printUsageError(message);
  }
}

if (require.main === module) {
  run(process.argv);
}
