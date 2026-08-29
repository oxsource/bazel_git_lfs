import { readFile } from 'node:fs/promises';
import { join, dirname, normalize, isAbsolute } from 'node:path';
import { parseBazelFile } from './bazel-parser';
import { Dependency } from './models';
import { BAZEL_FILES } from '@/config/constants';

export interface LoadedFileResult {
  dependencies: Dependency[];
  warnings: string[];
  filesScanned: string[];
}

export class BazelLoader {
  private visited = new Set<string>();

  constructor(private readonly projectDir: string) {}

  async loadEntryFiles(): Promise<LoadedFileResult> {
    const entryFiles = [...BAZEL_FILES];
    const deps: Dependency[] = [];
    const warnings: string[] = [];
    const filesScanned: string[] = [];

    for (const name of entryFiles) {
      const path = join(this.projectDir, name);
      const depsIn = await this.loadFile(path, name);
      deps.push(...depsIn.dependencies);
      warnings.push(...depsIn.warnings);
      if (depsIn.filesScanned.length > 0) {
        filesScanned.push(...depsIn.filesScanned);
      }
    }

    return { dependencies: deps, warnings, filesScanned };
  }

  private async loadFile(absPath: string, displayName: string): Promise<LoadedFileResult> {
    if (this.visited.has(absPath)) {
      return { dependencies: [], warnings: [], filesScanned: [] };
    }
    this.visited.add(absPath);

    let content: string;
    try {
      content = await readFile(absPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { dependencies: [], warnings: [], filesScanned: [] };
      }
      throw new Error(`Cannot read Bazel file: ${displayName}`);
    }

    const parsed = parseBazelFile(content, displayName);
    const deps = [...parsed.dependencies];
    const warnings = [...parsed.warnings];
    const filesScanned = [displayName];

    // Follow load() targets into .bzl files (relative to the loading file's directory).
    for (const load of parsed.loads) {
      const target = load.target;
      const relTarget = resolveLoadTarget(target);
      if (relTarget === null) {
        continue;
      }
      const loadedPath = isAbsolute(relTarget)
        ? relTarget
        : normalize(join(dirname(absPath), relTarget));
      const loadedDisplay = displayName.startsWith('/')
        ? relTarget
        : `${dirname(displayName)}/${relTarget}`;
      const sub = await this.loadFile(loadedPath, normalize(loadedDisplay));
      deps.push(...sub.dependencies);
      warnings.push(...sub.warnings);
      if (sub.filesScanned.length > 0) {
        filesScanned.push(...sub.filesScanned);
      }
    }

    return { dependencies: deps, warnings, filesScanned };
  }
}

function resolveLoadTarget(target: string): string | null {
  // Forms: //path/to/file.bzl (workspace-relative), @repo//path:file.bzl (external),
  // or :file.bzl (same package).
  if (target.startsWith('@')) {
    // External repo load — we cannot resolve the file content locally; report skip.
    return null;
  }
  if (target.startsWith('//')) {
    const rest = target.slice(2);
    const filePart = rest.includes(':') ? rest.slice(rest.indexOf(':') + 1) : rest;
    if (!filePart.endsWith('.bzl')) {
      return null;
    }
    return filePart;
  }
  if (target.startsWith(':')) {
    const filePart = target.slice(1);
    return filePart.endsWith('.bzl') ? filePart : null;
  }
  return null;
}
