export interface Dependency {
  name: string;
  urls: string[];
  sha256: string | null;
  stripPrefix: string | null;
  sourceFile: string;
  resolved: boolean;
}

export interface InspectResult {
  projectDir: string;
  dependencies: Dependency[];
  warnings: string[];
  filesScanned: string[];
  queryUsed: boolean;
  queryExternalRepos: string[] | null;
  dependencyRelations: Record<string, string[]> | null;
}

export function emptyInspectResult(projectDir: string): InspectResult {
  return {
    projectDir,
    dependencies: [],
    warnings: [],
    filesScanned: [],
    queryUsed: false,
    queryExternalRepos: null,
    dependencyRelations: null,
  };
}
