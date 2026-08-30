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
import { guard } from '@/cli/common';
import { objectRelativePath } from '@/objects/object-path';
import { sha256 } from '@/objects/sha256';

export interface InspectOptions {
  cwd: string;
  force?: boolean;
  update?: boolean;
  json?: boolean;
}

function say(msg: string): void {
  process.stderr.write(msg + '\n');
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
      say(`  Skipping "${dep.name}" — no SHA256`);
      continue;
    }

    const relPath = objectRelativePath(dep.urls[0], dep.sha256);
    const absPath = join(objectsDir, relPath);

    if (existsSync(absPath)) {
      say(`  "${dep.name}" — already exists`);
      continue;
    }

    say(`Downloading ${dep.name}...`);

    let downloaded = false;
    for (const url of dep.urls) {
      try {
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok || !response.body) continue;
        const buf = Buffer.from(await response.arrayBuffer());
        const actual = sha256.hexOfBuffer(buf);
        if (actual !== dep.sha256) {
          say(`  SHA256 mismatch for ${url}, trying next URL`);
          continue;
        }
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, buf);
        execFileSync('git', ['add', relPath], { cwd: objectsDir, stdio: 'pipe' });
        say(`  OK ${relPath}`);
        downloaded = true;
        updated++;
        break;
      } catch {
        continue;
      }
    }

    if (!downloaded) {
      say(`  FAILED`);
    }
  }

  if (updated > 0) {
    try {
      execFileSync('git', ['commit', '-m', `bazel-git-lfs: update ${updated} missing dependenc(y/ies)`], { cwd: objectsDir, stdio: 'pipe' });
      say(`Committed ${updated} new file(s)`);
    } catch {
      say('No changes to commit');
    }
  }
}

export async function runInspect(opts: InspectOptions): Promise<number> {
  const projectDir = guard.findProjectRoot(opts.cwd) ?? opts.cwd;
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

  try {
    if (!opts.force && existsSync(snapshotPath)) {
      const raw = await readFile(snapshotPath, 'utf8');
      result = JSON.parse(raw);
      if (opts.json) {
        process.stdout.write(raw);
      } else {
        printTable(result);
      }
      say('Using cached snapshot (use -f to re-scan).');
    } else {
      say('Scanning Bazel files...');
      result = await inspectProject({ projectDir });
      await store.write(projectDir, result);
      if (opts.json) {
        format.printResult({ ok: true, dependencies: result.dependencies, warnings: result.warnings }, { json: true });
      } else {
        printTable(result);
      }
    }
  } catch (err) {
    format.printResult({ ok: false, error: (err as Error).message }, { json: true });
    return EXIT_ERROR;
  }

  if (opts.update) {
    say('Checking for missing dependencies...');
    await updateMissing(opts, result);
  }

  if (result.hasConflicts) {
    say(`Conflicts detected: ${result.conflicts.length} conflicting declaration(s)`);
    if (opts.json) {
      format.printResult({ ok: false, error: 'Conflicting declarations detected', conflicts: result.conflicts }, { json: true });
    }
    return EXIT_ERROR;
  }
  return EXIT_OK;
}