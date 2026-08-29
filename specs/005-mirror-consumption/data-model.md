# Data Model: Mirror Consumption (verify / list / search / clean)

Entities from the feature spec. All data types are read from the existing Stage 3 manifest and objects store; no new storage entities are introduced.

## Entity: VerifyResult

Per-artifact outcome of the `verify` command.

- `sha256` (string) — the artifact's content address.
- `path` (string) — mirror-relative object path (from manifest).
- `status` (enum) — `valid` | `corrupt` | `missing`.
- `expected` (string | null) — the declared SHA256 from the manifest.
- `actual` (string | null) — the computed SHA256 of the stored object (present when `corrupt`).
- `message` (string | null) — human-readable explanation (e.g., "LFS object not found in storage").

## Entity: VerifyResultSet

The top-level `verify` command output.

- `command` (string) — `"verify"`.
- `results` (VerifyResult[]) — per-artifact outcomes.
- `summary` (VerifySummary) — counts.

**VerifySummary**:
- `total` (number)
- `valid` (number)
- `corrupt` (number)
- `missing` (number)

## Entity: ArtifactEntry

A single artifact from the mirror manifest, as returned by `list` and `search`.

- `sha256` (string) — content address.
- `path` (string) — mirror-relative object path (Maven-style).
- `sources` (string[]) — all known source URLs.
- `firstSeenAt` (string) — ISO-8601 timestamp of first mirroring.

## Entity: ListResult

The `list` command output.

- `command` (string) — `"list"`.
- `artifacts` (ArtifactEntry[]) — all or filtered manifest entries.
- `total` (number) — count of returned artifacts.
- `filters` (object | null) — the applied filters, if any (`{ sha256Prefix?, sourceUrl? }`).

## Entity: SearchResult

The `search` command output.

- `command` (string) — `"search"`.
- `keyword` (string) — the search term.
- `artifacts` (ArtifactEntry[]) — matching entries.
- `total` (number) — count of matches.

## Entity: CleanResult

The `clean` command output.

- `command` (string) — `"clean"`.
- `removed` (object) — `{ objects: boolean, mirror: boolean, snapshot: boolean }` indicating which paths were actually removed.

## Entity: ManifestFilter

Input to `list` filtering (FR-006).

- `sha256Prefix` (string | null) — case-insensitive prefix match on SHA256 hex.
- `sourceUrl` (string | null) — case-insensitive substring match on `sources[]`.

## Entity: SearchKeyword

Input to `search` (FR-007). A case-insensitive substring matched against:
- The artifact name (derived from the last path segment of the primary source URL, stripped of common archive extensions).
- The manifest entry's `path`.
- Every URL in `sources[]`.

## Relationships

- A **VerifyResultSet** contains zero or more **VerifyResult** entries.
- A **ListResult** / **SearchResult** contains zero or more **ArtifactEntry** entries (same shape, from the manifest).
- The **ArtifactEntry** is a projection of the manifest's `ManifestEntry` (Stage 3) plus the SHA256 key, with no additional storage.
- **CleanResult** does not reference the manifest; it operates on filesystem paths only.