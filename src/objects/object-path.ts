const MAX_SEGMENT_LENGTH = 100;

export interface ObjectPath {
  /** Directory path under the objects store, WITHOUT the sha256 file name. */
  directory: string;
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

function fallbackBucket(reason: string, bucket: string): ObjectPath {
  const sanitized = sanitizeSegment(bucket) || '_unparsable';
  return {
    directory: `_other/${sanitized}`,
    fallback: true,
    warning: `${reason}; object stored under fallback bucket "_other/${sanitized}"`,
  };
}

/**
 * Derive the Maven-style reversed-domain object directory from the
 * dependency's primary URL (research decision 1):
 *
 *   reversed lowercased host segments + URL path directory segments
 *   (the final path segment is the file name and is excluded)
 *
 * e.g. `https://github.com/facebook/react/releases/download/v1.2/x.tar.gz`
 *   → `com/github/facebook/react/releases/download/v1.2` (the `<sha256>`
 *   becomes the file name appended by the objects store), and
 *   `https://github.com/facebook/react/react.tar.gz`
 *   → `com/github/facebook/react`.
 *
 * Exotic URLs (unparsable, non-http(s), IP host) fall back to a
 * deterministic sanitized single bucket (`_other/<host_port>` or
 * `_other/<sanitized-url>`) and carry a warning.
 */
export function deriveObjectPath(primaryUrl: string, sha256: string): ObjectPath {
  void sha256;

  let parsed: URL;
  try {
    parsed = new URL(primaryUrl);
  } catch {
    return fallbackBucket(
      `unparsable URL: ${primaryUrl}`,
      primaryUrl.slice(0, MAX_SEGMENT_LENGTH),
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fallbackBucket(
      `unsupported protocol "${parsed.protocol}" (expected http/https)`,
      `${parsed.host}_${parsed.pathname}`,
    );
  }

  const host = parsed.hostname;
  if (host.length === 0) {
    return fallbackBucket('URL has an empty host', primaryUrl.slice(0, MAX_SEGMENT_LENGTH));
  }

  if (looksLikeIp(host)) {
    return fallbackBucket(
      `IP-literal host "${host}" — no domain to reverse`,
      parsed.port.length > 0 ? `${host}_${parsed.port}` : host,
    );
  }

  const hostSegments = sanitizeAll(
    host.split('.').map((segment) => segment.toLowerCase()),
  ).reverse();
  if (hostSegments.length === 0) {
    return fallbackBucket(`unusable URL host "${host}"`, host);
  }

  const pathSegments = sanitizeAll(parsed.pathname.split('/'));
  const endsWithSlash = parsed.pathname.endsWith('/');
  // The final segment of a non-slash-terminated path is the file name.
  const directories = endsWithSlash ? pathSegments : pathSegments.slice(0, -1);

  return { directory: [...hostSegments, ...directories].join('/'), fallback: false };
}

/**
 * True when a URL would land in the fallback bucket (callers surface the
 * warning without deriving the path twice).
 */
export function isFallbackUrl(primaryUrl: string): boolean {
  return deriveObjectPath(primaryUrl, '0'.repeat(64)).fallback;
}

/**
 * Convenience: full relative object path (directory + `<sha256>` file name).
 */
export function objectRelativePath(primaryUrl: string, sha256: string): string {
  return `${deriveObjectPath(primaryUrl, sha256).directory}/${sha256}`;
}
