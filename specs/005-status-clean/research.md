# Research: Status / Clean

Phase 0 research decisions resolving the technical unknowns for Stage 4. No NEEDS CLARIFICATION markers existed in the spec; all decisions are grounded in the existing Stage 3 abstractions.

## 1. Status mechanics

**Decision**: `status` reads the mirror manifest (via `ArtifactRepository.readManifest()`) and iterates each entry. For each artifact, it re-computes the SHA256 of the stored object and compares it against the manifest entry. The LFS object is materialized via the existing `repository.materialize([relPath])` (which calls `git lfs pull --include`), then hash-checked. If the materialized path does not exist (LFS object missing), the artifact is `missing`. If the hash mismatches, it is `corrupt`. If the hash matches, `valid`. The local objects store is also cross-checked: entries that exist locally but differ from the manifest are reported as warnings (the manifest is authoritative).

Optional filtering is supported via `--sha256-prefix <hex>` (case-insensitive prefix match on SHA256), `--source-url <substring>` (case-insensitive substring match on `sources[]`), and a positional `<keyword>` argument (case-insensitive substring match across artifact name derived from the last path segment of the primary source URL stripped of common archive extensions, the manifest entry's `path`, and every URL in `sources[]`). Filters narrow the set of artifacts checked by `status`.

**Rationale**: FR-001/FR-002/FR-003, FR-005/FR-006/FR-007. Reusing `repository.materialize()` and `sha256HexOfFile` from Stage 3 avoids duplication and keeps the G1 integrity gate consistent. Streaming SHA256 is inherited from `sha256HexOfFile` (memory-bounded, FR-012). Consolidating listing, search, and keyword filtering into `status` eliminates redundant commands — users can filter what they audit in a single invocation. The "name" derivation is a heuristic since the manifest does not store an explicit `name` field.

**Alternatives considered:** Reading the local store only (would miss corruption in the mirror itself — rejected); reading LFS objects directly via git plumbing (over-engineered — LFS pull is the simplest correct path, G5); separate `list`/`search` commands (redundant IO — the manifest is already read for status, so filtering in one pass is more efficient, G5).

## 3. Clean mechanics

**Decision**: `clean` removes three specific paths under `.bazel_git_lfs/` using `rmSync` with `recursive: true, force: true`: `objects/`, `mirror/`, and `dependencies.json`. The config file (`config.json`) and the `.gitignore` entry are explicitly preserved. The command checks for `init` first (valid config). If the paths don't exist, it is a no-op (idempotent, FR-018). Output is a JSON object listing the removed paths.

**Rationale**: FR-014/FR-015/FR-018. Straightforward filesystem operation. The config file is the user's "investment" (remote profile setup); preserving it enables the "reset without reconfiguring" workflow (US4). The `.gitignore` entry is also preserved (it's harmless and useful).

**Alternatives considered:** Removing the whole `.bazel_git_lfs/` directory (would lose config — rejected); requiring `--all` to also remove config (not in scope — user chose "keep config" in the clarification).

## 3. Output & exit conventions

**Decision**: Identical to Stage 2/3: JSON-only stdout, `{ ok: false, error }` for errors, non-zero exit. `status` result shape: `{ ok, command, results: [{ name, sha256, status, expected?, actual?, path? }], summary: { total, valid, corrupt, missing } }`. When filters are applied, the output includes `filters: { sha256Prefix?, sourceUrl?, keyword? }`. `clean` result: `{ ok, command, removed: { objects?, mirror?, snapshot? } }`.

**Rationale**: FR-009/FR-015 + consistency with the existing CLI contracts.

## 4. Testing strategy

**Decision**: Vitest. Unit: status classification (fake repository with controlled manifest + materialized file bytes) and filtering (prefix/source-url/keyword matching on a fixture manifest), clean file removal (mock `rmSync` via `vi.mock` or use a temp directory). Integration: real git-lfs mirror (via `createTestMirror` from Stage 3) with a deliberately corrupted object; `status` detects the corruption and respects filtering flags; `clean` end-to-end (init → inspect → fetch → clean → assert state). Contract: CLI surface (commands registered, exit codes, JSON-only output).