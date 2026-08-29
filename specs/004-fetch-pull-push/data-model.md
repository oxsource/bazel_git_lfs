# Data Model: Mirroring Core (fetch / pull / push)

Entities from the feature spec. The local-store model is backend-agnostic (G4); the mirror model is owned by the `ArtifactRepository` abstraction.

## Entity: ObjectRef

An address of one artifact in the local objects store.

- `url` (string) — the dependency's **primary (first) URL**; determines the directory path (decision: research §1).
- `sha256` (string) — 64-char lowercase hex; the content address and file name.
- `relativePath` (string) — path under `.bazel_git_lfs/objects/`, e.g. `com/github/facebook/react/<sha256>` (Maven-style reversed host + URL path segments minus filename).
- `absolutePath` (string) — `projectDir/.bazel_git_lfs/objects/<relativePath>`.

**Validation**: `sha256` must match `/^[0-9a-f]{64}$/`; path segments are sanitized to `[a-z0-9._-]+` (lowercased host segments; other segments keep case, sanitized); no empty segments.

## Entity: Objects Store

The `.bazel_git_lfs/objects/` tree — the local content-addressed store and the source of truth for `push`.

- Keyed by content: one file per SHA256 under its derived directory.
- `put` is atomic: stream → temp file → SHA256 verify → `mkdir -p` → rename (FR-004). A failed verify deletes the temp and never renames.
- `has` re-verifies the stored content's SHA256, so corrupt entries behave as absent (FR-005).
- Holds no metadata of its own; provenance lives in the mirror manifest.

## Entity: FetchStatus / PullStatus / PushStatus (per-dependency results)

Discriminated results, one per snapshot dependency:

- `fetched` — downloaded from origin, verified, stored (fetch).
- `cached` — already present locally and re-verified; no network (fetch/pull).
- `uploaded` — pushed to the mirror in this run (push).
- `already-mirrored` — SHA256 already in the mirror manifest; skipped (push).
- `missing-local` — object absent from the local store; hint to run `fetch`; informational, not a failure (push).
- `pulled` — transferred from the mirror, verified, stored (pull).
- `not-in-mirror` — no manifest entry for the dependency's SHA256; failing (pull).
- `failed` — with `reason`: `hash-mismatch` | `missing-sha256` | `network` | `no-url-succeeded` | `store-error` | `git-error`.

## Entity: MirrorManifest

The authoritative inventory stored as `manifest.json` at the mirror repository root.

- `version` (number) — schema version, currently `1`.
- `updatedAt` (string) — ISO-8601 timestamp of the last successful push that changed it.
- `objects` (Record<string, ManifestEntry>) — keyed by SHA256.

**ManifestEntry**:
- `path` (string) — mirror-relative object path (same Maven-style layout).
- `sources` (string[]) — all known source URLs for this content; merged (union) across pushes; first URL is primary.
- `firstSeenAt` (string) — ISO-8601 of the first upload; preserved on merge.

**Rules**: entries are immutable per SHA256 except `sources` (append-only union) and the manifest's `updatedAt`; objects and the manifest always change in the same commit (FR-020).

## Entity: Mirror Profile

Stage 1 config (reused): `alias`, `url` (git URL of the mirror repo), timestamps. `pull`/`push` require the **effective default** profile (FR-012); `fetch` does not.

## Entity: Dependency Snapshot

Stage 2's persisted `InspectResult` at `.bazel_git_lfs/dependencies.json` — the sole dependency input for all three commands. Read-only here; only `inspect` writes it.

## Entity: LFS Working Clone

The disposable clone of the mirror at `.bazel_git_lfs/mirror/` used by push/pull transfers.

- Always reset or re-cloned before use (never a source of truth).
- Deleted-and-recloned when dirty beyond reset repair.

## Relationships

- A **Dependency Snapshot** lists Dependencies; each dependency's `urls[0]` + `sha256` determine the **ObjectRef** path.
- **Fetch** moves bytes origin → **Objects Store** (verify gate).
- **Push** moves bytes **Objects Store** → mirror (via the LFS working clone) and updates the **MirrorManifest** in the same commit.
- **Pull** moves bytes mirror → **Objects Store** (verify gate), resolving via the **MirrorManifest**; origin is never contacted.
- The **Mirror Profile** addresses the mirror for push/pull; the **MirrorManifest** is the authoritative mirror inventory consumed later by Stage 4 (`verify`/`list`/`search`).
- Identical SHA256 across different dependencies/URLs/projects collapses to one local file and one manifest entry (G3/FR-014).
