import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';

export type PreHookResult =
  | { proceed: true; args?: string[] }
  | { proceed: false; message: string; exitCode?: number };

export type PreHook = (args: string[], cwd: string) => PreHookResult | Promise<PreHookResult>;
export type PostHook = (exitCode: number, args: string[], cwd: string) => void | Promise<void>;

interface HookSet {
  pre?: PreHook;
  post?: PostHook;
}

const registry = new Map<string, HookSet>();

export function registerCommand(name: string, hooks?: HookSet): void {
  registry.set(name, hooks ?? {});
}

export function isRegistered(name: string): boolean {
  return registry.has(name);
}

function objectsDir(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, 'objects');
}

function hasInnerGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: objectsDir(cwd), stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function doPassthrough(args: string[], cwd: string): Promise<number> {
  const objDir = objectsDir(cwd);
  if (!hasInnerGitRepo(cwd)) {
    format.printResult({ ok: false, error: `No inner git repository found. Run "bazel-git-lfs init" first.` }, { json: true });
    return EXIT_ERROR;
  }
  try {
    execFileSync('git', args, { cwd: objDir, stdio: 'inherit' });
    return EXIT_OK;
  } catch (err) {
    const status = (err as { status?: number }).status ?? EXIT_ERROR;
    return status;
  }
}

export async function handle(args: string[], cwd: string): Promise<number> {
  if (args.length === 0) {
    return doPassthrough(['help'], cwd);
  }

  const cmd = args[0];
  const cmdArgs = args.slice(1);
  const hooks = registry.get(cmd);

  if (!hooks) {
    return doPassthrough(args, cwd);
  }

  // Execute pre-hook if present.
  if (hooks.pre) {
    const preResult = await hooks.pre(cmdArgs, cwd);
    if (!preResult.proceed) {
      format.printResult({ ok: false, error: preResult.message }, { json: true });
      return preResult.exitCode ?? EXIT_ERROR;
    }
    // Use modified args from pre-hook, or original args.
    const passthroughArgs = preResult.args ? [cmd, ...preResult.args] : [cmd, ...cmdArgs];
    const exitCode = await doPassthrough(passthroughArgs, cwd);
    if (hooks.post) {
      await hooks.post(exitCode, passthroughArgs, cwd);
    }
    return exitCode;
  }

  // Execute passthrough followed by post-hook.
  const passthroughArgs = [cmd, ...cmdArgs];
  const exitCode = await doPassthrough(passthroughArgs, cwd);
  if (hooks.post) {
    await hooks.post(exitCode, passthroughArgs, cwd);
  }
  return exitCode;
}