# Data Model: Status / Clean

Entities from the feature spec. All data types are read from the existing Stage 3 manifest and objects store; no new storage entities are introduced.

## Entity: StatusResult

Per-artifact outcome of the `status` command.

- `sha256` (string) — the artifact's content address.
- `path` (string) — mirror-relative object path (from manifest).
- `status` (enum) — `valid` | `corrupt` | `missing`.
- `expected` (string | null) — the declared SHA256 from the manifest.
- `actual` (string | null) — the computed SHA256 of the stored object (present when `corrupt`).
- `message` (string | null) — human-readable explanation (e.g., "LFS object not found in storage").

## Entity: StatusResultSet

The top-level `status` command output.

- `command` (string) — `"status"`.
- `results` (StatusResult[]) — per-artifact outcomes.
- `summary` (StatusSummary) — counts.
- `filters` (object | null) — applied filters if any (`{ sha256Prefix?, sourceUrl?, keyword? }`).

**StatusSummary**:
- `total` (number)
- `valid` (number)
- `corrupt` (number)
- `missing` (number)

## Entity: CleanResult

The `clean` command output.

- `command` (string) — `"clean"`.
- `removed` (object) — `{ objects: boolean, mirror: boolean, snapshot: boolean }` indicating which paths were actually removed.

## Relationships

- A **StatusResultSet** contains zero or more **StatusResult** entries.
- **CleanResult** does not reference the manifest; it operates on filesystem paths only.