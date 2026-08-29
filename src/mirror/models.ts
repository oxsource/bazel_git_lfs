export interface ManifestEntry {
  /** Mirror-relative object path (Maven-style reversed-domain layout). */
  path: string;
  /** All known source URLs for this content; first URL is primary. */
  sources: string[];
  /** ISO-8601 timestamp of the first upload; preserved on merge. */
  firstSeenAt: string;
}

export interface MirrorManifest {
  version: number;
  updatedAt: string;
  objects: Record<string, ManifestEntry>;
}

/** The configured default remote a push/pull targets. */
export interface RemoteInfo {
  alias: string;
  url: string;
}

export interface ManifestUpdate {
  sha256: string;
  path: string;
  /** Source URLs to union into the entry (first is primary). */
  sources: string[];
}

export const MANIFEST_VERSION = 1;
