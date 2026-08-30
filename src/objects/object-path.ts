const MAX_SEGMENT_LENGTH = 100;

/**
 * Generic URL path segments that carry no information about the artifact
 * itself and are omitted from the derived path (e.g. github releases paths).
 */
const OMIT_SEGMENTS = new Set(['releases', 'download', 'downloads', 'archive', 'raw', 'files']);

export interface ObjectPath {
  /** Directory path under the objects store (without the file name). */
  directory: string;
  /** The original file name from the URL (e.g. `opencv-4.10.0-android-sdk.zip`). */
  fileName: string;
  /** True when the URL was exotic and the fallback bucket was used. */
  fallback: boolean;
  /** Human-readable note when `fallback` is true. */
  warning?: string;
}

/**
 * Sanitize a URL segment for use as a directory name: anything outside
 * `[a-zA-Z0-9._-]` becomes `_`; empty and dot segments are dropped.
 */
export function sanitizeSegment(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, MAX_SEGMENT_LENGTH);
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return '';
  }
  return cleaned;
}

function sanitizeAll(segments: string[]): string[] {
  return segments.map(sanitizeSegment).filter((segment) => segment.length > 0);
}

function looksLikeIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
}

function fallbackBucket(reason: string, bucket: string, fileName = 'object'): ObjectPath {
  const sanitized = sanitizeSegment(bucket) || '_unparsable';
  const sanitizedFile = sanitizeSegment(fileName) || 'object';
  return {
    directory: `_other/${sanitized}`,
    fileName: sanitizedFile,
    fallback: true,
    warning: `${reason}; object stored under fallback bucket "_other/${sanitized}"`,
    };
}

/** Extract the last path segment of a URL as the file name, if any. */
function urlFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter((s) => s.length > 0);
    return parts.length > 0 ? parts[parts.length - 1] : 'object';
  } catch {
    return 'object';
  }
}

function stripQueryAndFragment(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname;
}

/**
 * Derive the Maven-style reversed-domain object path from the dependency's
 * primary URL:
 *
 *   reversed lowercased host segments + URL path directory segments
 *   (omitting generic segments such as `releases`/`download`/`archive`)
 *   with the original file name preserved as the file name.
 *
 * e.g. `https://github.com/opencv/opencv/releases/download/4.10.0/opencv-4.10.0-android-sdk.zip`
 *   → directory `com/github/opencv/opencv/4.10.0`
 *   → fileName `opencv-4.10.0-android-sdk.zip`
 *
 * Exotic URLs (unparsable, non-http(s), IP host) fall back to a
 * deterministic sanitized single bucket (`_other/<host_port>` or
 * `_other/<sanitized-url>`) and carry a warning.
 */
export function deriveObjectPath(primaryUrl: string, _sha256: string): ObjectPath {
  let parsed: URL;
  try {
    parsed = new URL(primaryUrl);
  } catch {
    return fallbackBucket(
      `unparsable URL: ${primaryUrl}`,
      primaryUrl.slice(0, MAX_SEGMENT_LENGTH),
      urlFileName(primaryUrl),
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fallbackBucket(
      `unsupported protocol "${parsed.protocol}" (expected http/https)`,
      `${parsed.host}_${parsed.pathname}`,
      urlFileName(primaryUrl),
    );
  }

  const host = parsed.hostname;
  if (host.length === 0) {
    return fallbackBucket(
      'URL has an empty host',
      primaryUrl.slice(0, MAX_SEGMENT_LENGTH),
      urlFileName(primaryUrl),
    );
  }

  if (looksLikeIp(host)) {
    return fallbackBucket(
      `IP-literal host "${host}" — no domain to reverse`,
      parsed.port.length > 0 ? `${host}_${parsed.port}` : host,
      urlFileName(primaryUrl),
    );
  }

  const hostSegments = sanitizeAll(
    host.split('.').map((segment) => segment.toLowerCase()),
  ).reverse();
  if (hostSegments.length === 0) {
    return fallbackBucket(
      `unusable URL host "${host}"`,
      host,
      urlFileName(primaryUrl),
    );
  }

  const pathname = stripQueryAndFragment(primaryUrl);
  const allSegments = sanitizeAll(pathname.split('/'));
  const endsWithSlash = pathname.endsWith('/');

  // Preserve the original file name (last segment) unless the path ends with '/'.
  let fileName = 'object';
  let dirSegments = allSegments;
  if (!endsWithSlash && allSegments.length > 0) {
    fileName = allSegments[allSegments.length - 1];
    dirSegments = allSegments.slice(0, -1);
  }

  // Omit generic segments (releases/download/archive/...) and empty ones.
  const directories = dirSegments.filter((segment) => !OMIT_SEGMENTS.has(segment.toLowerCase()));

  return {
    directory: [...hostSegments, ...directories].join('/'),
    fileName,
    fallback: false,
  };
}

/**
 * True when a URL would land in the fallback bucket (callers surface the
 * warning without deriving the path twice).
 */
export function isFallbackUrl(primaryUrl: string): boolean {
  return deriveObjectPath(primaryUrl, '0'.repeat(64)).fallback;
}

/**
 * Full relative path of the stored object file: `<directory>/<fileName>`.
 */
export function objectRelativePath(primaryUrl: string, _sha256: string): string {
  const path = deriveObjectPath(primaryUrl, _sha256);
  return `${path.directory}/${path.fileName}`;
}

/**
 * Full relative path of the checksum sidecar file: `<directory>/<fileName>.sha256`.
 */
export function objectSha256RelativePath(primaryUrl: string, _sha256: string): string {
  const path = deriveObjectPath(primaryUrl, _sha256);
  return `${path.directory}/${path.fileName}.sha256`;
}
