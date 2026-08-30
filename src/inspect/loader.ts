import { readFile } from 'node:fs/promises';
import { join, dirname, normalize, isAbsolute } from 'node:path';
import { parseBazelFile } from './bazel-parser';
import { Dependency, DependencyConflict } from './models';
import { BAZEL_FILES } from '@/config/constants';
import { ExternalResolver, RESOLVE_DEPTH_LIMIT } from './external-resolver';

type LoadTarget = 
  | { type: 'local'; path: string }
  | { type: 'external'; repo: string; path: string }
  | null;

export interface LoadedFileResult {
  dependencies: Dependency[];
  warnings: string[];
  filesScanned: string[];
  conflicts: DependencyConflict[];
}

interface DeclarationRecord {
  dep: Dependency;
  urls: string[];
  sha256: string | null;
  stripPrefix: string | null;
}

function normalizeDeclarationPredicate(dep: Dependency): { urls: string[]; sha256: string | null; stripPrefix: string | null } {
  return {
    urls: [...dep.urls].sort(),
    sha256: dep.sha256,
    stripPrefix: dep.stripPrefix,
  };
}

function declarationsDiffer(a: { urls: string[]; sha256: string | null; stripPrefix: string | null }, b: { urls: string[]; sha256: string | null; stripPrefix: string | null }): Array<'urls' | 'sha256' | 'stripPrefix'> {
  const differing: Array<'urls' | 'sha256' | 'stripPrefix'> = [];
  if (JSON.stringify(a.urls) !== JSON.stringify(b.urls)) differing.push('urls');
  if (a.sha256 !== b.sha256) differing.push('sha256');
  if (a.stripPrefix !== b.stripPrefix) differing.push('stripPrefix');
  return differing;
}

export class BazelLoader {
  private visited = new Set<string>();
  private depMap = new Map<string, Dependency>();
  private declarations = new Map<string, DeclarationRecord>();
  private conflicts: DependencyConflict[] = [];

  constructor(
    private readonly projectDir: string,
    private readonly resolver?: ExternalResolver,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  async loadEntryFiles(): Promise<LoadedFileResult> {
    const entryFiles = [...BAZEL_FILES];
    const deps: Dependency[] = [];
    const warnings: string[] = [];
    const filesScanned: string[] = [];

    for (const name of entryFiles) {
      const path = join(this.projectDir, name);
      this.log(`Scanning ${name}...`);
      const depsIn = await this.loadFile(path, name, 0);
      deps.push(...depsIn.dependencies);
      warnings.push(...depsIn.warnings);
      if (depsIn.filesScanned.length > 0) {
        filesScanned.push(...depsIn.filesScanned);
      }
    }

    return { dependencies: deps, warnings, filesScanned, conflicts: this.conflicts };
  }

  private async loadFile(
    absPath: string,
    displayName: string,
    depth: number,
  ): Promise<LoadedFileResult> {
    if (this.visited.has(absPath)) {
      return { dependencies: [], warnings: [], filesScanned: [], conflicts: [] };
    }
    if (depth > RESOLVE_DEPTH_LIMIT) {
      return {
        dependencies: [],
        warnings: [`load chain too deep (depth > ${RESOLVE_DEPTH_LIMIT}): ${displayName}`],
        filesScanned: [],
        conflicts: [],
      };
    }
    this.visited.add(absPath);

    this.log(`  Scanning ${displayName}`);

    let content: string;
    try {
      content = await readFile(absPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { dependencies: [], warnings: [], filesScanned: [], conflicts: [] };
      }
      throw new Error(`Cannot read Bazel file: ${displayName}`);
    }

    const parsed = parseBazelFile(content, displayName);
    const deps: Dependency[] = [];
    const warnings = [...parsed.warnings];
    const filesScanned = [displayName];

    // Filter out localhost URLs from each dependency's URL list.
    const filtered = parsed.dependencies.map((dep) => {
      const filteredUrls = dep.urls.filter((u) => !u.includes('localhost'));
      if (filteredUrls.length < dep.urls.length) {
        this.log(`  Filtered localhost URLs from "${dep.name}"`);
      }
      return { ...dep, urls: filteredUrls };
    }).filter((dep) => dep.urls.length > 0);

    // First-encounter bookkeeping: deduplicate and detect conflicts.
    for (const dep of filtered) {
      const existing = this.declarations.get(dep.name);
      if (!existing) {
        // First encounter — record it.
        this.declarations.set(dep.name, {
          dep,
          ...normalizeDeclarationPredicate(dep),
        });
        this.depMap.set(dep.name, dep);
        deps.push(dep);
      } else {
        const norm = normalizeDeclarationPredicate(dep);
        const differing = declarationsDiffer(
          { urls: existing.urls, sha256: existing.sha256, stripPrefix: existing.stripPrefix },
          norm,
        );
        if (differing.length === 0) {
          // Identical content — deduplicate.
        } else {
          // Divergent — conflict.
          this.conflicts.push({
            repo: dep.name,
            adopted: {
              sourceFile: existing.dep.sourceFile,
              urls: existing.dep.urls,
              sha256: existing.dep.sha256,
              stripPrefix: existing.dep.stripPrefix,
            },
            divergent: {
              sourceFile: dep.sourceFile,
              urls: dep.urls,
              sha256: dep.sha256,
              stripPrefix: dep.stripPrefix,
            },
            differingFields: differing,
          });
        }
      }
    }

    // Follow load() targets into .bzl files (DFS).
    for (const load of parsed.loads) {
      const target = resolveLoadTarget(load.target);
      if (target === null) {
        continue;
      }

      if (target.type === 'local') {
        const loadedPath = isAbsolute(target.path)
          ? target.path
          : normalize(join(dirname(absPath), target.path));
        const loadedDisplay = displayName.startsWith('/')
          ? target.path
          : `${dirname(displayName)}/${target.path}`;
        const sub = await this.loadFile(
          loadedPath,
          normalize(loadedDisplay),
          depth + 1,
        );
        deps.push(...sub.dependencies);
        warnings.push(...sub.warnings);
        if (sub.filesScanned.length > 0) {
          filesScanned.push(...sub.filesScanned);
        }
        continue;
      }

      // External repo load: @repo//path:file.bzl
      if (!this.resolver) {
        warnings.push(`cannot resolve load ${load.target}: no external resolver configured`);
        continue;
      }

      const sourceDep = this.depMap.get(target.repo) ?? undefined;
      const resolution = await this.resolver.resolve(target.repo, sourceDep);

      if (resolution.status === 'unresolved' || !resolution.rootDir) {
        warnings.push(
          `cannot resolve load ${load.target}: repository "${target.repo}" not in working area and download fallback ${sourceDep ? 'failed' : 'not available (not yet declared)'}`,
        );
        continue;
      }

      const externalBzlPath = normalize(join(resolution.rootDir, target.path));
      const externalDisplayName = load.target;

      const sub = await this.loadFile(
        externalBzlPath,
        externalDisplayName,
        depth + 1,
      );

      deps.push(...sub.dependencies);
      warnings.push(...sub.warnings);
      if (sub.filesScanned.length > 0) {
        filesScanned.push(...sub.filesScanned);
      }
    }

    return { dependencies: deps, warnings, filesScanned, conflicts: this.conflicts };
  }
}

function resolveLoadTarget(target: string): LoadTarget {
  if (target.startsWith('@')) {
    const rest = target.slice(1);
    const sepIndex = rest.indexOf('//');
    if (sepIndex < 0) return null;
    const repo = rest.slice(0, sepIndex);
    const pathPart = rest.slice(sepIndex + 2);
    const filePart = pathPart.includes(':') ? pathPart.slice(pathPart.indexOf(':') + 1) : pathPart;
    if (!filePart.endsWith('.bzl')) {
      return null;
    }
    return { type: 'external', repo, path: filePart };
  }

  if (target.startsWith('//')) {
    const rest = target.slice(2);
    const filePart = rest.includes(':') ? rest.slice(rest.indexOf(':') + 1) : rest;
    if (!filePart.endsWith('.bzl')) {
      return null;
    }
    return { type: 'local', path: filePart };
  }

  if (target.startsWith(':')) {
    const filePart = target.slice(1);
    return filePart.endsWith('.bzl') ? { type: 'local', path: filePart } : null;
  }

  return null;
}