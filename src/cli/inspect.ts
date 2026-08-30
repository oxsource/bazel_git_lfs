import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { paths, CONFIG_DIR_NAME } from '@/config/paths';
import { inspectProject } from '@/inspect/inspector';
import { InspectResult } from '@/inspect/models';
import { FsSnapshotStore } from '@/inspect/snapshot';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { COMMANDS, TOOL_NAME, DIRS } from '@/config/constants';
import { objectRelativePath } from '@/objects/object-path';
import { sha256 } from '@/objects/sha256';

export interface InspectOptions {
  cwd: string;
  force?: boolean;
  verbose?: boolean;
  update?: boolean;
  json?: boolean;
}

function log(opts: InspectOptions, msg: string): void {
  if (opts.verbose) {
    process.stderr.write(`[inspect] ${msg}\n`);
  }
}

function printTable(result: InspectResult): void {
  const deps = result.dependencies;
  if (deps.length === 0) {
    process.stdout.write('No dependencies found.\n');
    return;
  }

  const rows = deps.map((d) => [d.name, d.urls[0] ?? '']);
  const nameWidth = Math.max('NAME'.length, ...rows.map((r) => r[0].length));

  const pad = (s: string, w: number) => s.padEnd(w);

  process.stdout.write(`${pad('NAME', nameWidth)}  URL\n`);
  process.stdout.write(`${'-'.repeat(nameWidth)}  ${'-'.repeat(60)}\n`);
  for (const [name, url] of rows) {
    process.stdout.write(`${pad(name, nameWidth)}  ${url}\n`);
  }
}

async function updateMissing(opts: InspectOptions, result: InspectResult): Promise<void> {
  const objectsDir = join(opts.cwd, CONFIG_DIR_NAME, DIRS.OBJECTS);
  let updated = 0;

  for (const dep of result.dependencies) {
    if (!dep.sha256 || !sha256.isHex(dep.sha256)) {
      log(opts, `Skipping "${dep.name}" — no SHA256`);
      continue;
    }

    const relPath = objectRelativePath(dep.urls[0], dep.sha256);
    const absPath = join(objectsDir, relPath);

    if (existsSync(absPath)) {
      log(opts, `  "${dep.name}" — already exists`);
      continue;
    }

    log(opts, `  Downloading "${dep.name}"...`);

    let downloaded = false;
    for (const url of dep.urls) {
      try {
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok || !response.body) continue;
        const buf = Buffer.from(await response.arrayBuffer());
        const actual = sha256.hexOfBuffer(buf);
        if (actual !== dep.sha256) {
          log(opts, `    SHA256 mismatch for ${url}, trying next URL`);
          continue;
        }
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, buf);
        execFileSync('git', ['add', relPath], { cwd: objectsDir, stdio: 'pipe' });
        log(opts, `    Downloaded and staged: ${relPath}`);
        downloaded = true;
        updated++;
        break;
      } catch {
        continue;
      }
    }

    if (!downloaded) {
      log(opts, `    Failed to download "${dep.name}"`);
    }
  }

  if (updated > 0) {
    try {
      execFileSync('git', ['commit', '-m', `bazel-git-lfs: update ${updated} missing dependenc(y/ies)`], { cwd: objectsDir, stdio: 'pipe' });
      log(opts, `Committed ${updated} new file(s)`);
    } catch {
      log(opts, 'No changes to commit');
    }
  }
}

export async function runInspect(opts: InspectOptions): Promise<number> {
  const projectDir = opts.cwd;
  const configDir = paths.projectConfigDir(projectDir);

  if (!existsSync(configDir)) {
    format.printResult(
      {
        ok: false,
        error: `Not a valid bazel_git_lfs project: ${projectDir}. Run "${TOOL_NAME} ${COMMANDS.INIT}" first.`,
      },
      { json: true },
    );
    return EXIT_ERROR;
  }

  const store = new FsSnapshotStore();
  const snapshotPath = store.snapshotPath(projectDir);

  let result: InspectResult;

  if (!opts.force && existsSync(snapshotPath)) {
    try {
      const raw = await readFile(snapshotPath, 'utf8');
      result = JSON.parse(raw);
      if (opts.json) {
        process.stdout.write(raw);
      } else {
        printTable(result);
      }
    } catch {
      result = await inspectProject({ projectDir, verbose: opts.verbose });
      await store.write(projectDir, result);
      if (opts.json) {
        format.printResult({ ok: true, dependencies: result.dependencies, warnings: result.warnings }, { json: true });
      } else {
        printTable(result);
      }
    }
  } else {
    result = await inspectProject({ projectDir, verbose: opts.verbose });
    await store.write(projectDir, result);
    if (opts.json) {
      format.printResult({ ok: true, dependencies: result.dependencies, warnings: result.warnings }, { json: true });
    } else {
      printTable(result);
    }
  }

  if (opts.update) {
    log(opts, 'Checking for missing dependencies...');
    await updateMissing(opts, result);
  }

  return result.hasConflicts ? EXIT_ERROR : EXIT_OK;
}