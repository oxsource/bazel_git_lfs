#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '@/cli/init';
import { runInspect } from '@/cli/inspect';
import { runCleanCommand } from '@/cli/clean';
import { runCheckoutCommand } from '@/cli/checkout';
import { runCompletion } from '@/cli/completion';
import { handle, registerCommand } from '@/cli/interceptor';
import { format } from '@/cli/format';
import { COMMANDS, TOOL_NAME } from '@/config/constants';
import { postRemoteAdd } from '@/hooks/post-remote-add';

const VERSION: string = __BGL_VERSION__;

export interface CliDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const CUSTOM_COMMANDS: ReadonlySet<string> = new Set([
  COMMANDS.INIT,
  COMMANDS.INSPECT,
  COMMANDS.CLEAN,
  COMMANDS.CHECKOUT,
  COMMANDS.COMPLETION,
]);

registerCommand(COMMANDS.REMOTE, {
  post: postRemoteAdd,
});

function isHelpOrVersion(arg: string): boolean {
  return arg === '--help' || arg === '-h' || arg === '--version' || arg === '-V';
}

export function buildProgram(deps: CliDeps = {}): Command {
  const program = new Command();
  const cwd = deps.cwd ?? process.cwd();

  program
    .name(TOOL_NAME)
    .description(
      'Discover and mirror Bazel remote HTTP dependencies into a shared Git LFS repository',
    )
    .version(VERSION)
    .exitOverride()
    .configureOutput({ writeErr: () => {} });

  program
    .command(COMMANDS.INIT)
    .description('Initialize a non-versioned .bazel_git_lfs config area in the current project')
    .option('--json', 'output machine-readable JSON')
    .action(async (options: { json?: boolean }) => {
      process.exitCode = await runInit({ json: Boolean(options.json), cwd });
    });

  program
    .command(COMMANDS.INSPECT)
    .description(
      'Discover the current project\u2019s remote HTTP dependencies and persist the snapshot (JSON)',
    )
    .option('-f, --force', 'force re-scan even if cached snapshot exists')
    .option('-u, --update', 'download missing dependencies')
    .option('--json', 'output machine-readable JSON')
    .allowExcessArguments(false)
    .action(async (options: { force?: boolean; update?: boolean; json?: boolean }) => {
      process.exitCode = await runInspect({ cwd, force: Boolean(options.force), update: Boolean(options.update), json: Boolean(options.json) });
    });

  program
    .command(COMMANDS.CLEAN)
    .description(
      'Remove the .bazel_git_lfs directory entirely',
    )
    .allowExcessArguments(false)
    .action(async () => {
      process.exitCode = await runCleanCommand({ cwd });
    });

  program
    .command(COMMANDS.CHECKOUT)
    .description(
      'Switch dependency URLs between original, local, or remote mirror sources based on the alias (JSON)',
    )
    .argument('<alias>', 'target alias: default/-- (original), local/@ (file://), or a branch name')
    .allowExcessArguments(false)
    .action(async (alias: string) => {
      process.exitCode = await runCheckoutCommand({ cwd, alias });
    });

  program
    .command(COMMANDS.COMPLETION)
    .description('Generate shell completion script')
    .argument('[shell]', 'bash or zsh (default: auto-detect from SHELL env)')
    .action(async (shell: string | undefined) => {
      process.exitCode = await runCompletion({ shell });
    });

  return program;
}

export function run(argv: string[]): void {
  const args = argv.slice(2);

  // Show custom command help if no args or help/version.
  if (args.length === 0 || isHelpOrVersion(args[0])) {
    const program = buildProgram();
    try {
      program.parse(argv);
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
        return;
      }
    }
    return;
  }

  // Check if it's a custom command.
  if (CUSTOM_COMMANDS.has(args[0])) {
    const program = buildProgram();
    try {
      program.parse(argv);
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'commander.helpDisplayed') {
        return;
      }
      if (error.code === 'commander.version') {
        return;
      }
      const message = (error.message ?? 'Unknown error').replace(/^error: /, '');
      format.printUsageError(message);
    }
    return;
  }

  // Everything else: delegate to interceptor → git -C .bazel_git_lfs/objects <args>.
  const cwd = process.cwd();
  handle(args, cwd).then((code) => {
    process.exitCode = code;
  });
}

if (require.main === module) {
  run(process.argv);
}