# Data Model: Discovery (inspect)

Entities from the feature spec. The discovery model is backend-agnostic (G4) and shared with later stages (sync/verify/rewrite consume these types).

## Entity: Dependency

A remote HTTP dependency discovered in a Bazel project.

- `name` (string) — rule name (e.g., `abseil`).
- `urls` (string[]) — one or more source URLs; first is primary.
- `sha256` (string | null) — Bazel-declared integrity hash. *Validation: when present, must be a 64-char hex string; absence is reported (not blocking), matching the parent guide.*
- `stripPrefix` (string | null) — optional `strip_prefix` metadata.
- `sourceFile` (string) — which file declared it: an entry file (`WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel`) or a loaded `.bzl` file (relative path).
- `resolved` (boolean) — whether this record was resolved from literal arguments (`true`) or reported from an unresolvable loop/variable declaration (`false`; see Inspect Result warnings).

**Identity / uniqueness**: A dependency is identified by `name` within a project; `sourceFile` disambiguates duplicates across files. Content identity (by sha256) is a later-stage concern.

## Entity: Inspect Result

The outcome of inspecting one project.

- `projectDir` (string) — the inspected project directory.
- `dependencies` (Dependency[]) — all discovered dependencies (may be empty).
- `warnings` (string[]) — notes for declarations that could not be fully resolved (e.g., a `for` loop whose values depend on runtime-only logic, or a `load()` target that is missing/unreadable), so nothing is silently dropped (FR-010).
- `filesScanned` (string[]) — which files were found and parsed (entry files + loaded `.bzl` files).
- `queryUsed` (boolean) — whether Bazel's native `query` was successfully used as a cross-check (FR-011).
- `queryExternalRepos` (string[] | null) — the authoritative set of external repositories from `query` when used (identifies "actually used" vs merely declared); `null` when query was unavailable/failed.
- `dependencyRelations` (Record<string, string[]> | null) — dependency relationships surfaced by `query` when used; `null` otherwise.

## Entity: Dependency Snapshot

The persisted form of an Inspect Result, stored under the project's `.bazel_git_lfs/dependencies.json` by `inspect` and read by later `list`/query reads.

- Contents: the full Inspect Result (projectDir, dependencies, warnings, filesScanned, query fields).
- Written atomically (temp file + rename) by `inspect` (FR-013); refreshed/overwritten on re-run.
- `inspect` is the only writer of the snapshot; it writes nothing else to the project (FR-003/FR-003a).

## Relationships

- An **Inspect Result** contains zero or more **Dependencies**.
- A **Dependency** originates from exactly one file (its `sourceFile` — an entry file or a loaded `.bzl` file).
- A **Dependency** may carry unresolved attributes captured in **Inspect Result warnings** (rather than fabricating values).
- The **Inspect Result** optionally includes the **Bazel-query authoritative external-repo set** and **dependency relations**, cross-checking the file-inspection results (FR-011).
- A **Dependency Snapshot** is a persisted **Inspect Result**; later stages read it for fast `list`/query without re-inspecting (FR-003a).
- Producing an **Inspect Result** does not require a mirror profile; persisting it writes only to the tool-owned `.bazel_git_lfs` area, never business source files.
