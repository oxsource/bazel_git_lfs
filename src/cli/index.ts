#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '@/cli/init';
import { runInspect } from '@/cli/inspect';
import { runFetchCommand } from '@/cli/fetch';
import { runPullCommand } from '@/cli/pull';
import { runPushCommand } from '@/cli/push';
import { runStatusCommand } from '@/cli/status';
import { runCleanCommand } from '@/cli/clean';
import { runCheckoutCommand } from '@/cli/checkout';
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

const STUB_COMMANDS: readonly string[] = [];

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
      process.exitCode = await runInit({ json: Boolean(options.json), cwd });
    });

  program
    .command('inspect')
    .description(
      'Discover the current project\u2019s remote HTTP dependencies and persist the snapshot (JSON)',
    )
    .allowExcessArguments(false)
    .action(async () => {
      process.exitCode = await runInspect({ cwd });
    });

  program
    .command('fetch')
    .description(
      'Download snapshot dependencies from their source URLs into the local objects store (JSON)',
    )
    .allowExcessArguments(false)
    .action(async () => {
      process.exitCode = await runFetchCommand({ cwd });
    });

  program
    .command('push')
    .description(
      'Upload local objects to the configured Git LFS mirror, update the manifest, commit and push (JSON)',
    )
    .allowExcessArguments(false)
    .action(async () => {
      process.exitCode = await runPushCommand({ cwd, env });
    });

  program
    .command('pull')
    .description(
      'Transfer snapshot dependencies from the configured Git LFS mirror into the local objects store (JSON)',
    )
    .allowExcessArguments(false)
    .action(async () => {
      process.exitCode = await runPullCommand({ cwd, env });
    });

  program
    .command('status')
    .description(
      'Check every mirrored artifact\u2019s SHA256 against the manifest and report valid/corrupt/missing (JSON)',
    )
    .option('--sha256-prefix <hex>', 'filter by SHA256 prefix (case-insensitive)')
    .option('--source-url <substring>', 'filter by source URL substring (case-insensitive)')
    .argument('[keyword]', 'search keyword across artifact names, paths, and URLs')
    .allowExcessArguments(false)
    .action(async (keyword: string | undefined, options: { sha256Prefix?: string; sourceUrl?: string }) => {
      process.exitCode = await runStatusCommand({
        cwd,
        sha256Prefix: options.sha256Prefix,
        sourceUrl: options.sourceUrl,
        keyword,
      });
    });

  program
    .command('clean')
    .description(
      'Remove local objects store, mirror working clone, and snapshot; preserve config (JSON)',
    )
    .allowExcessArguments(false)
    .action(async () => {
      process.exitCode = await runCleanCommand({ cwd });
    });

  program
    .command('checkout')
    .description(
      'Switch dependency URLs between original, local, or remote mirror sources based on the alias (JSON)',
    )
    .argument('<alias>', 'target alias: default/-- (original), local/@ (file://), or a profile name')
    .allowExcessArguments(false)
    .action(async (alias: string) => {
      process.exitCode = await runCheckoutCommand({ cwd, alias });
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
      process.exitCode = code;
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
      process.exitCode = code;
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
      process.exitCode = code;
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
      process.exitCode = code;
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
      process.exitCode = code;
    });
  alias
    .command('list')
    .description('List all global mirror aliases')
    .option('--json', 'output machine-readable JSON')
    .action(async (options: OutputOptions) => {
      const code = await runRemoteAliasList({ json: Boolean(options.json), cwd, env });
      process.exitCode = code;
    });
  alias
    .command('remove')
    .description('Remove a global mirror alias')
    .argument('<name>', 'alias name')
    .option('--json', 'output machine-readable JSON')
    .action(async (name: string, options: OutputOptions) => {
      const code = await runRemoteAliasRemove({ json: Boolean(options.json), name, cwd, env });
      process.exitCode = code;
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
