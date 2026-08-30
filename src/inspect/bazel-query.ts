import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Dependency } from './models';
import { extractDepsByRegex } from './regex-extractor';

const execFileAsync = promisify(execFile);

const BAZEL_QUERY_TIMEOUT_MS = 5 * 60_000;

export interface BazelQueryResult {
  /** True when bazel was available and the query succeeded. */
  available: boolean;
  /** Authoritative repository names resolved by Bazel (WORKSPACE mode). */
  names: string[];
  /** Error message when unavailable or failed. */
  error?: string;
}

const HTTP_ARCHIVE_QUERY = 'kind(http_archive, //external:*)';

/**
 * Ask Bazel which external repositories are actually declared/resolved in the
 * project (WORKSPACE mode). This is the authoritative source of dependency
 * names because Bazel itself evaluates the full dependency graph, including
 * transitive declarations inside loaded .bzl files and data-driven for-loops.
 *
 * Returns empty names when bazel is not installed or the query fails, so
 * callers can fall back to structural/static parsing.
 */
export async function queryHttpArchiveRepos(
  projectDir: string,
): Promise<BazelQueryResult> {
  try {
    const { stdout } = await execFileAsync(
      'bazel',
      ['query', HTTP_ARCHIVE_QUERY],
      { cwd: projectDir, timeout: BAZEL_QUERY_TIMEOUT_MS },
    );
    const names = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('//external:'))
      .map((line) => line.slice('//external:'.length))
      .filter((name) => name.length > 0);
    return { available: true, names: [...new Set(names)] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { available: false, names: [], error: message };
  }
}

/**
 * Extract url/urls/sha256/strip_prefix attributes for the given repository
 * name from a corpus of Bazel source text (WORKSPACE files and loaded .bzl
 * content). Uses regex extraction over the raw source so it is independent of
 * any particular declaration style (direct rules, dict lists, wrappers).
 *
 * The name is authoritative (from bazel query); attributes are best-effort
 * regex matches.
 */
export function extractAttributesForName(
  name: string,
  sources: string[],
): Dependency | null {
  for (const source of sources) {
    const candidates = extractDepsByRegex(source);
    const match = candidates.find((d) => d.name === name);
    if (match) {
      return {
        name,
        urls: match.urls,
        sha256: match.sha256,
        stripPrefix: match.stripPrefix,
        sourceFile: match.sourceFile,
        resolved: true,
      };
    }
  }
  return null;
}
