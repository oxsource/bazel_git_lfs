# Data Model: Discovery (scan)

Entities from the feature spec. The discovery model is backend-agnostic (G4) and shared with later stages (sync/verify/rewrite consume these types).

## Entity: Dependency

A remote HTTP dependency discovered in a Bazel project.

- `name` (string) — rule name (e.g., `abseil`).
- `urls` (string[]) — one or more source URLs; first is primary.
- `sha256` (string | null) — Bazel-declared integrity hash. *Validation: when present, must be a 64-char hex string; absence is reported (not blocking), matching the parent guide.*
- `stripPrefix` (string | null) — optional `strip_prefix` metadata.
- `sourceFile` (string) — which file declared it: an entry file (`WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel`) or a loaded `.bzl` file (relative path).
- `resolved` (boolean) — whether this record was resolved from literal arguments (`true`) or reported from an unresolvable loop/variable declaration (`false`; see Scan Result warnings).

**Identity / uniqueness**: A dependency is identified by `name` within a project; `sourceFile` disambiguates duplicates across files. Content identity (by sha256) is a later-stage concern.

## Entity: Scan Result

The outcome of scanning one project.

- `projectDir` (string) — the scanned project directory.
- `dependencies` (Dependency[]) — all discovered dependencies (may be empty).
- `warnings` (string[]) — notes for declarations that could not be fully resolved (e.g., a `for` loop whose values depend on runtime-only logic, or a `load()` target that is missing/unreadable), so nothing is silently dropped (FR-010).
- `filesScanned` (string[]) — which files were found and parsed (entry files + loaded `.bzl` files).
- `queryUsed` (boolean) — whether Bazel's native `query` was successfully used as a cross-check (FR-011).
- `queryExternalRepos` (string[] | null) — the authoritative set of external repositories from `query` when used (identifies "actually used" vs merely declared); `null` when query was unavailable/failed.
- `dependencyRelations` (Record<string, string[]> | null) — dependency relationships surfaced by `query` when used; `null` otherwise.

## Relationships

- A **Scan Result** contains zero or more **Dependencies**.
- A **Dependency** originates from exactly one file (its `sourceFile` — an entry file or a loaded `.bzl` file).
- A **Dependency** may carry unresolved attributes captured in **Scan Result warnings** (rather than fabricating values).
- The **Scan Result** optionally includes the **Bazel-query authoritative external-repo set** and **dependency relations**, cross-checking the file-scanning results (FR-011).
- The **Scan Result** is produced without any side effects (strictly read-only, FR-003) and does not require a mirror profile.
