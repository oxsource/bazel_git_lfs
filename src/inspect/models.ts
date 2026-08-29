export interface Dependency {
  name: string;
  urls: string[];
  sha256: string | null;
  stripPrefix: string | null;
  sourceFile: string;
  resolved: boolean;
  /** Where the declaration lives: project tree ('entry') vs external repo bzl ('external-bzl'). */
  origin: 'entry' | 'external-bzl';
  /** Apparent repo name whose bzl declared this dependency; null for 'entry'. */
  fromRepo: string | null;
  /** Ordered load chain from entry to the declaring bzl; empty for 'entry'. */
  loadChain: string[];
  /** Additional load chains that re-declared this dependency identically. */
  alsoLoadedBy: string[][];
}

export interface DependencyConflict {
  /** Repository/dependency name that was declared divergently. */
  repo: string;
  /** First-encountered (DFS) declaration. */
  adopted: ConflictDeclaration;
  /** Later, differing declaration. */
  divergent: ConflictDeclaration;
  /** Which fields differ between the two declarations. */
  differingFields: Array<'urls' | 'sha256' | 'stripPrefix'>;
}

export interface ConflictDeclaration {
  sourceFile: string;
  urls: string[];
  sha256: string | null;
  stripPrefix: string | null;
}

export interface InspectResult {
  schemaVersion: number;
  projectDir: string;
  dependencies: Dependency[];
  warnings: string[];
  filesScanned: string[];
  queryUsed: boolean;
  queryExternalRepos: string[] | null;
  dependencyRelations: Record<string, string[]> | null;
  conflicts: DependencyConflict[];
  hasConflicts: boolean;
}

export function emptyInspectResult(projectDir: string): InspectResult {
  return {
    schemaVersion: 2,
    projectDir,
    dependencies: [],
    warnings: [],
    filesScanned: [],
    queryUsed: false,
    queryExternalRepos: null,
    dependencyRelations: null,
    conflicts: [],
    hasConflicts: false,
  };
}

export function coerceDependency(dep: Partial<Dependency>): Dependency {
  return {
    name: dep.name ?? '',
    urls: dep.urls ?? [],
    sha256: dep.sha256 ?? null,
    stripPrefix: dep.stripPrefix ?? null,
    sourceFile: dep.sourceFile ?? '',
    resolved: dep.resolved ?? false,
    origin: dep.origin ?? 'entry',
    fromRepo: dep.fromRepo ?? null,
    loadChain: dep.loadChain ?? [],
    alsoLoadedBy: dep.alsoLoadedBy ?? [],
  };
}

export function coerceInspectResult(raw: Partial<InspectResult>): InspectResult {
  return {
    schemaVersion: raw.schemaVersion ?? 1,
    projectDir: raw.projectDir ?? '',
    dependencies: (raw.dependencies ?? []).map(coerceDependency),
    warnings: raw.warnings ?? [],
    filesScanned: raw.filesScanned ?? [],
    queryUsed: raw.queryUsed ?? false,
    queryExternalRepos: raw.queryExternalRepos ?? null,
    dependencyRelations: raw.dependencyRelations ?? null,
    conflicts: raw.conflicts ?? [],
    hasConflicts: raw.hasConflicts ?? false,
  };
}