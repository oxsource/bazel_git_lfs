import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { sha256 } from '@/objects/sha256';
import { Dependency } from '@/inspect/models';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

const BAZEL_INFO_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export const RESOLVE_DEPTH_LIMIT = 32;

export type ResolutionStatus = 'sandbox' | 'fallback' | 'unresolved';

export interface ResolutionResult {
  repo: string;
  status: ResolutionStatus;
  rootDir: string | null;
  temp: boolean;
  sourceDep: Dependency | null;
}

interface SandboxLocation {
  outputBase: string;
}

async function locateOutputBase(projectDir: string): Promise<SandboxLocation | null> {
  try {
    const { stdout } = await execFileAsync(
      'bazel',
      ['info', 'output_base'],
      { cwd: projectDir, timeout: BAZEL_INFO_TIMEOUT_MS },
    );
    const path = stdout.trim();
    if (!path) return null;
    return { outputBase: path };
  } catch {
    return null;
  }
}

async function resolveSandboxDir(
  outputBase: string,
  repo: string,
): Promise<string | null> {
  const externalDir = join(outputBase, 'external');

  // Exact match (WORKSPACE-era naming).
  const exactPath = join(externalDir, repo);
  try {
    const { stat } = await import('node:fs/promises');
    await stat(exactPath);
    return exactPath;
  } catch {
    // continue
  }

  // Bzlmod tolerant match: directory whose name starts with repo followed by ~ or +.
  try {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(externalDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name === repo || name.startsWith(repo + '~') || name.startsWith(repo + '+')) {
        return join(externalDir, name);
      }
      // Also check: <owner>+<name>+<version> where name is in the middle segment.
      const parts = name.split('+');
      if (parts.length >= 3 && parts[1] === repo) {
        return join(externalDir, name);
      }
    }
  } catch {
    // can't read external dir
  }

  // Secondary probe: bazel mod dump_repo_mapping.
  try {
    const { stdout } = await execFileAsync(
      'bazel',
      ['mod', 'dump_repo_mapping', ''],
      { cwd: join(outputBase, '..'), timeout: BAZEL_INFO_TIMEOUT_MS },
    );
    if (stdout.trim()) {
      const mapping: Record<string, string> = JSON.parse(stdout);
      const canonical = mapping[repo];
      if (canonical) {
        // Try canonical name, also try last segment after ~.
        const canonicalDir = join(externalDir, canonical);
        try {
          const { stat } = await import('node:fs/promises');
          await stat(canonicalDir);
          return canonicalDir;
        } catch {
          // fall through
        }
      }
    }
  } catch {
    // dump_repo_mapping unavailable
  }

  return null;
}

async function downloadAndExtract(
  dep: Dependency,
): Promise<ResolutionResult | null> {
  if (!dep.sha256 || !sha256.isHex(dep.sha256)) {
    return null;
  }
  if (!dep.urls || dep.urls.length === 0) {
    return null;
  }

  const tempDir = join(tmpdir(), `bgl-extract-${randomUUID()}`);
  const archivePath = join(tempDir, 'archive');

  try {
    await mkdir(tempDir, { recursive: true });

    // Download first reachable URL.
    let downloaded = false;
    for (const url of dep.urls) {
      try {
        const response = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
        if (!response.ok || !response.body) continue;
        const stream = response.body as unknown as NodeJS.ReadableStream;
        await pipeline(stream, createWriteStream(archivePath));
        downloaded = true;
        break;
      } catch {
        continue;
      }
    }

    if (!downloaded) return null;

    // Verify sha256.
    const actual = await sha256.hexOfFile(archivePath);
    if (actual !== dep.sha256) return null;

    // Extract.
    const extractDir = join(tempDir, 'content');
    await mkdir(extractDir, { recursive: true });

    // Try tar first (handles tar.gz, tar.bz2, tar.xz, and zip via bsdtar).
    const { status: tarStatus } = await execFileAsync(
      'tar', ['-xf', archivePath, '-C', extractDir],
      { timeout: 30_000 },
    ).then(() => ({ status: 0 })).catch(() => ({ status: 1 }));

    if (tarStatus !== 0) {
      // Fall back to unzip.
      try {
        await execFileAsync('unzip', ['-q', archivePath, '-d', extractDir], { timeout: 30_000 });
      } catch {
        return null;
      }
    }

    // Determine the repo root: if stripPrefix is set, expect <extractDir>/<stripPrefix>/;
    // otherwise the extraction could have a single top-level directory.
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(extractDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());

    let rootDir: string;
    if (dep.stripPrefix) {
      rootDir = join(extractDir, dep.stripPrefix);
      try {
        const { stat } = await import('node:fs/promises');
        await stat(rootDir);
      } catch {
        rootDir = extractDir; // stripPrefix not found — fall back to extract root
      }
    } else if (dirs.length === 1) {
      rootDir = join(extractDir, dirs[0].name);
    } else {
      rootDir = extractDir;
    }

    return {
      repo: dep.name,
      status: 'fallback',
      rootDir,
      temp: true,
      sourceDep: dep,
    };
  } catch {
    await rm(tempDir, { recursive: true, force: true });
    return null;
  }
}

export class ExternalResolver {
  private outputBase: string | null | undefined = undefined;
  private cachedResolutions = new Map<string, ResolutionResult>();
  private tempDirs = new Map<string, string>();

  constructor(private readonly projectDir: string) {}

  async resolve(repo: string, sourceDep?: Dependency): Promise<ResolutionResult> {
    const cached = this.cachedResolutions.get(repo);
    if (cached) return cached;

    // Sandbox path resolution.
    if (this.outputBase === undefined) {
      this.outputBase = (await locateOutputBase(this.projectDir))?.outputBase ?? null;
    }

    let result: ResolutionResult | null = null;

    if (this.outputBase) {
      const sandboxDir = await resolveSandboxDir(this.outputBase, repo);
      if (sandboxDir) {
        result = {
          repo,
          status: 'sandbox',
          rootDir: sandboxDir,
          temp: false,
          sourceDep: null,
        };
      }
    }

    // Download fallback.
    let tempDir: string | null = null;
    if (!result && sourceDep) {
      const fb = await downloadAndExtract(sourceDep);
      if (fb) {
        result = fb;
        tempDir = fb.rootDir ? dirname(fb.rootDir) : null;
      }
    }

    if (!result) {
      result = {
        repo,
        status: 'unresolved',
        rootDir: null,
        temp: false,
        sourceDep: null,
      };
    }

    if (tempDir) this.tempDirs.set(repo, tempDir);
    this.cachedResolutions.set(repo, result);
    return result;
  }

  /** Clean up any temp directories created during resolution. */
  async cleanup(): Promise<void> {
    for (const [, tempDir] of this.tempDirs) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    this.tempDirs.clear();
    this.cachedResolutions.clear();
  }

  /** Forget a repo so the next resolve() re-fetches (for retry-on-error). */
  invalidate(repo: string): void {
    this.cachedResolutions.delete(repo);
    const tempDir = this.tempDirs.get(repo);
    if (tempDir) {
      this.tempDirs.delete(repo);
    }
  }
}