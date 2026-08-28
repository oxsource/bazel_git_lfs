# Data Model: Bazel Dependency Mirror Tool

Entities extracted from the feature spec. Backend-agnostic core (G4); the Git LFS adapter is a separate implementation concern.

## Entity: Dependency

A remote HTTP dependency discovered in a Bazel project.

- `name` (string) — unique rule name (e.g., `abseil`).
- `urls` (string[]) — one or more source URLs; first is primary.
- `sha256` (string, required) — Bazel-declared integrity hash. *Validation: must be present and 64 hex chars; a dependency without a declared sha256 is flagged and not auto-mirrored.*
- `stripPrefix` (string, optional) — Bazel `strip_prefix` metadata.
- `sourceFile` (string) — which file declared it (`WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel`).
- `version` / `tag` (string, optional) — derived from URL/tag when determinable, used in mirror path.

**Uniqueness / identity**: A dependency is identified by `name` within a project. Its *content* identity is `sha256` (see Artifact). Two dependencies with different names but identical sha256 are the same Artifact.

## Entity: Artifact

The downloaded file that will be mirrored.

- `id` (string) — content identity = `sha256`.
- `sha256` (string) — computed hash; MUST equal declared hash before storage.
- `size` (number) — byte size.
- `localPath` (string) — path in the local cache.
- `sourceUrls` (string[]) — where it came from.
- `mirrorPath` (string) — path inside the mirror repo (e.g., `artifacts/abseil/20250127.0.tar.gz`).

**State transitions**: `downloaded → verified(sha256 match) → cached → uploaded to mirror → recorded in manifest`. If verification fails, transitions to `rejected` (never cached/stored).

## Entity: Manifest Entry

A record in `manifest.json` for a mirrored artifact.

- `source` (string) — original source URL.
- `sha256` (string) — canonical hash.
- `path` (string) — mirror-relative path.

**Identity**: keyed by `artifact-id` (name-version). Used for existence checks, SHA256 lookup, integrity, and auditing (FR-009).

## Entity: Local Cache

Content-addressed store on disk.

- Key: `sha256` (content identity).
- Value: artifact bytes + sidecar with source URL(s).
- Validation: hash recomputed on read; mismatched entry treated as invalid and re-downloaded.

## Entity: Mirror Repository

The shared Git LFS repository.

- Git tree holds: `manifest.json`, `README.md`, `.gitattributes`, `scripts/`, `artifacts/*` (pointer files).
- Git LFS holds: the large archive blobs.
- Remote: self-hosted GitLab repository (e.g., `bazel/bazel-mirror`).

## Relationships

- A **Dependency** resolves to an **Artifact** via its declared `sha256`.
- An **Artifact** may be referenced by multiple **Dependencies** (dedup, G3).
- An **Artifact** uploads into the **Mirror Repository** and is described by a **Manifest Entry**.
- The **Local Cache** intermediates downloads before upload.