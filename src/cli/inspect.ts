import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { paths, CONFIG_DIR_NAME } from '@/config/paths';
import { inspectProject } from '@/inspect/inspector';
import { InspectResult } from '@/inspect/models';
import { FsSnapshotStore } from '@/inspect/snapshot';
import { format, EXIT_OK, EXIT_ERROR } from '@/cli/format';
import { COMMANDS, TOOL_NAME, DIRS, FILES } from '@/config/constants';
import { guard } from '@/cli/common';
import { objectRelativePath, objectSha256RelativePath } from '@/objects/object-path';
import { sha256 } from '@/objects/sha256';
import { emptyManifest, mergeManifest, serializeManifest, parseManifest } from '@/mirror/manifest';
import { isLocalFallbackUrl } from '@/mirror/checkout';
import { BazelConfig, toDependency } from '@/config/bazelconfig';
import type { ManifestUpdate } from '@/mirror/models';

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

async function downloadWithProgress(
  label: string,
  url: string,
  expectedSha: string,
): Promise<{ ok: true; data: Buffer } | { ok: false; reason: 'http' | 'timeout' | 'hash-mismatch' | 'network'; message: string }> {
  const timeoutMs = 10 * 60_000;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok || !response.body) {
      return { ok: false, reason: 'http', message: `HTTP ${response.status}` };
    }

    const total = Number(response.headers.get('content-length') ?? 0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    process.stderr.write(`Downloading ${label}... `);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          const pct = Math.min(100, Math.round((received / total) * 100));
          process.stderr.write(`\rDownloading ${label}... ${pct}% (${(received / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
        } else {
          process.stderr.write(`\rDownloading ${label}... ${(received / 1024 / 1024).toFixed(1)}MB`);
        }
      }
    }
    const pad = ' '.repeat(label.length + 32);
    process.stderr.write(`\r${pad}\rDownloading ${label}... done\n`);

    const buf = Buffer.concat(chunks);
    const actual = sha256.hexOfBuffer(buf);
    if (actual !== expectedSha) {
      return { ok: false, reason: 'hash-mismatch', message: `expected ${expectedSha.slice(0, 12)}… got ${actual.slice(0, 12)}…` };
    }
    return { ok: true, data: buf };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout', message: 'request timed out' };
    }
    return { ok: false, reason: 'network', message: err instanceof Error ? err.message : String(err) };
  }
}

async function updateMissing(opts: InspectOptions, result: InspectResult): Promise<void> {
  const objectsDir = join(opts.cwd, CONFIG_DIR_NAME, DIRS.OBJECTS);
  const serverPort = BazelConfig.fromFile(opts.cwd).serverPort();
  let updated = 0;
  const updates: ManifestUpdate[] = [];

  for (const dep of result.dependencies) {
    if (!dep.sha256 || !sha256.isHex(dep.sha256)) {
      say(`  Skipping "${dep.name}" — no SHA256`);
      continue;
    }

    const relPath = objectRelativePath(dep.urls[0], dep.sha256);
    const shaRelPath = objectSha256RelativePath(dep.urls[0], dep.sha256);
    const absPath = join(objectsDir, relPath);

    // Every dependency with a valid sha256 contributes to the manifest,
    // whether the object is already stored or freshly downloaded.
    const sources = dep.urls.filter((u) => !isLocalFallbackUrl(u, serverPort));
    if (sources.length > 0) {
      updates.push({ sha256: dep.sha256, path: relPath, sources });
    }

    if (existsSync(absPath)) {
      say(`  "${dep.name}" — already exists`);
      continue;
    }

    let downloaded = false;
    for (const url of dep.urls) {
      const result = await downloadWithProgress(dep.name, url, dep.sha256);
      if (!result.ok) {
        if (result.reason === 'hash-mismatch') {
          say(`  SHA256 mismatch for ${url} (${result.message}), trying next URL`);
        } else if (result.reason === 'timeout') {
          say(`  Timeout for ${url}, trying next URL`);
        } else {
          say(`  Failed for ${url} (${result.message}), trying next URL`);
        }
        continue;
      }
      try {
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, result.data);
        writeFileSync(join(objectsDir, shaRelPath), dep.sha256 + '\n');
        // Stage the LFS tracking file (created by `init`'s `git lfs track`)
        // alongside the object files so it is committed on the first update.
        const addArgs = [relPath, shaRelPath];
        if (existsSync(join(objectsDir, FILES.GIT_ATTRIBUTES))) {
          addArgs.push(FILES.GIT_ATTRIBUTES);
        }
        execFileSync('git', ['add', ...addArgs], { cwd: objectsDir, stdio: 'pipe' });
        say(`  OK ${relPath} (+ ${shaRelPath})`);
        downloaded = true;
        updated++;
        break;
      } catch (err) {
        say(`  Store error: ${(err as Error).message}`);
        continue;
      }
    }

    if (!downloaded) {
      say(`  FAILED`);
    }
  }

  // Write/merge manifest.json (non-versioned, lives in .bazel_git_lfs/) so
  // checkout can map URLs to mirror paths.
  if (updates.length > 0) {
    try {
      let manifest = emptyManifest();
      const manifestPath = join(opts.cwd, CONFIG_DIR_NAME, FILES.MANIFEST);
      try {
        if (existsSync(manifestPath)) {
          manifest = parseManifest(readFileSync(manifestPath, 'utf8'));
        }
      } catch {
        // invalid existing manifest; start fresh
      }
      manifest = mergeManifest(manifest, updates);
      writeFileSync(manifestPath, serializeManifest(manifest));
      say(`Updated ${FILES.MANIFEST} with ${updates.length} object(s)`);
    } catch (err) {
      say(`Warning: failed to update ${FILES.MANIFEST}: ${(err as Error).message}`);
    }
  }

  // Commit staged object files (manifest is non-versioned, so only objects commit).
  if (updated > 0) {
    try {
      execFileSync('git', ['commit', '-m', `bazel-git-lfs: update ${updated} missing dependenc(y/ies)`], { cwd: objectsDir, stdio: 'pipe' });
      say(`Committed ${updated} new file(s)`);
    } catch {
      say('No changes to commit');
    }
  }
}

/**
 * Apply `.bazelconfig` overrides to an inspect result in place:
 * - `inspect.append`: merge manually-added dependencies (dedupe by name).
 * - `inspect.exclude`: drop dependencies whose name matches (exact match).
 */
function applyBazelConfig(result: InspectResult, projectDir: string): void {
  const config = BazelConfig.fromFile(projectDir);

  const appendDeps = config.inspectAppend().map(toDependency);
  const exclude = new Set(config.inspectExclude());

  if (appendDeps.length > 0) {
    const existing = new Set(result.dependencies.map((d) => d.name));
    for (const dep of appendDeps) {
      if (!existing.has(dep.name)) {
        result.dependencies.push(dep);
        existing.add(dep.name);
        result.warnings.push(`[config] appended manual dependency "${dep.name}"`);
        say(`  [config] appended manual dependency "${dep.name}"`);
      }
    }
  }

  if (exclude.size > 0) {
    const before = result.dependencies.length;
    result.dependencies = result.dependencies.filter((d) => !exclude.has(d.name));
    if (result.dependencies.length < before) {
      const n = before - result.dependencies.length;
      result.warnings.push(`[config] excluded ${n} dependency/dependencies from .bazelconfig`);
      say(`  [config] excluded ${n} dependency/dependencies from .bazelconfig`);
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
      say('Using cached snapshot (use -f to re-scan).');
    } else {
      say('Scanning Bazel files...');
      result = await inspectProject({ projectDir });
    }

    // Apply .bazelconfig overrides (append manual deps, exclude unwanted) and
    // persist the effective snapshot so -u and later runs stay consistent.
    applyBazelConfig(result, projectDir);
    await store.write(projectDir, result);

    if (opts.json) {
      format.printResult({ ok: true, dependencies: result.dependencies, warnings: result.warnings }, { json: true });
    } else {
      printTable(result);
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