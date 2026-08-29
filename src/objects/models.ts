export interface ObjectRef {
  /** The dependency's primary (first) URL; determines the directory path. */
  url: string;
  /** 64-char lowercase hex content address; also the object file name. */
  sha256: string;
  /** Path under `.bazel_git_lfs/objects/`, e.g. `com/github/facebook/react/<sha256>`. */
  relativePath: string;
  /** Absolute path of the object file. */
  absolutePath: string;
  /** True when the URL was exotic (IP/port/non-http) and the fallback bucket was used. */
  fallback: boolean;
  /** Human-readable note when `fallback` is true. */
  warning?: string;
}

export type FetchStatus = 'fetched' | 'cached' | 'failed';
export type PushStatus = 'uploaded' | 'already-mirrored' | 'missing-local' | 'failed';
export type PullStatus = 'pulled' | 'cached' | 'not-in-mirror' | 'failed';

export type FailReason =
  | 'hash-mismatch'
  | 'missing-sha256'
  | 'network'
  | 'no-url-succeeded'
  | 'store-error'
  | 'git-error'
  | 'not-in-mirror';

/** Per-dependency result shared by fetch/pull/push command outputs. */
export interface PerDependencyResult {
  name: string;
  sha256: string | null;
  status: FetchStatus | PushStatus | PullStatus;
  reason?: FailReason;
  /** Mirror-relative object path when relevant (uploaded/pulled). */
  path?: string;
  /** Extra actionable text (e.g., not-in-mirror hint). */
  message?: string;
}

export interface FetchSummary {
  total: number;
  fetched: number;
  cached: number;
  failed: number;
}

export interface PushSummary {
  total: number;
  uploaded: number;
  'already-mirrored': number;
  'missing-local': number;
  failed: number;
}

export interface PullSummary {
  total: number;
  pulled: number;
  cached: number;
  'not-in-mirror': number;
  failed: number;
}

export function countByStatus(results: PerDependencyResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
  }
  return counts;
}
