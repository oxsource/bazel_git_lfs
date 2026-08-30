export interface Dependency {
  name: string;
  urls: string[];
  sha256: string | null;
  stripPrefix: string | null;
  sourceFile: string;
  resolved: boolean;
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
  };
}

export function coerceInspectResult(raw: Partial<InspectResult>): InspectResult {
  return {
    schemaVersion: raw.schemaVersion ?? 1,
    projectDir: raw.projectDir ?? '',
    dependencies: (raw.dependencies ?? []).map(coerceDependency),
    warnings: raw.warnings ?? [],
    filesScanned: raw.filesScanned ?? [],
    conflicts: raw.conflicts ?? [],
    hasConflicts: raw.hasConflicts ?? false,
  };
}