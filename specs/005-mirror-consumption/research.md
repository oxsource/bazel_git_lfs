# Research: Mirror Consumption (verify / list / search / clean)

Phase 0 research decisions resolving the technical unknowns for Stage 4. No NEEDS CLARIFICATION markers existed in the spec; all decisions are grounded in the existing Stage 3 abstractions.

## 1. Verify mechanics

**Decision**: `verify` reads the mirror manifest (via `ArtifactRepository.readManifest()`) and iterates each entry. For each artifact, it re-computes the SHA256 of the stored object and compares it against the manifest entry. The LFS object is materialized via the existing `repository.materialize([relPath])` (which calls `git lfs pull --include`), then hash-checked. If the materialized path does not exist (LFS object missing), the artifact is `missing`. If the hash mismatches, it is `corrupt`. If the hash matches, `valid`. The local objects store is also cross-checked: entries that exist locally but differ from the manifest are reported as warnings (the manifest is authoritative).

**Rationale**: FR-001/FR-002/FR-003. Reusing `repository.materialize()` and `sha256HexOfFile` from Stage 3 avoids duplication and keeps the G1 integrity gate consistent. Streaming SHA256 is inherited from `sha256HexOfFile` (memory-bounded, FR-012).

**Alternatives considered:** Reading the local store only (would miss corruption in the mirror itself — rejected); reading LFS objects directly via git plumbing (over-engineered — LFS pull is the simplest correct path, G5).

## 2. List/search mechanics

**Decision**: `list` reads the manifest (via `parseManifest` from Stage 3), applies optional filters (`--sha256-prefix` and `--source-url`), and outputs the matching entries as JSON. Filters are case-insensitive substring matches on the respective fields. `search <keyword>` performs a case-insensitive substring match across three fields: the artifact "name" (derived from the last path segment of the primary source URL, stripped of `.tar.gz`/`.tgz`/`.zip`/`.bz2` extensions), the manifest entry's `path`, and every source URL in `sources[]`. Both commands read the manifest from the LFS working clone (via `repository.readManifest()`) and require no LFS object transfer.

**Rationale**: FR-005/FR-006/FR-007. The manifest is a small JSON file (a few hundred KB even for hundreds of artifacts); loading it entirely into memory is negligible. The "name" derivation is a heuristic — the manifest does not store an explicit `name` field; the source URL's filename (without extension) is the most natural label for searching.

**Alternatives considered:** Full-text search engine (overkill — G5); reading the manifest for each filter (fine — it's already in memory); requiring an explicit `name` field in the manifest (would require a manifest schema change — rejected for V1).

## 3. Clean mechanics

**Decision**: `clean` removes three specific paths under `.bazel_git_lfs/` using `rmSync` with `recursive: true, force: true`: `objects/`, `mirror/`, and `dependencies.json`. The config file (`config.json`) and the `.gitignore` entry are explicitly preserved. The command checks for `init` first (valid config). If the paths don't exist, it is a no-op (idempotent, FR-018). Output is a JSON object listing the removed paths.

**Rationale**: FR-014/FR-015/FR-018. Straightforward filesystem operation. The config file is the user's "investment" (remote profile setup); preserving it enables the "reset without reconfiguring" workflow (US4). The `.gitignore` entry is also preserved (it's harmless and useful).

**Alternatives considered:** Removing the whole `.bazel_git_lfs/` directory (would lose config — rejected); requiring `--all` to also remove config (not in scope — user chose "keep config" in the clarification).

## 4. Output & exit conventions

**Decision**: Identical to Stage 2/3: JSON-only stdout, `{ ok: false, error }` for errors, non-zero exit. `verify` result shape: `{ ok, command, results: [{ name, sha256, status, expected?, actual?, path? }], summary: { total, valid, corrupt, missing } }`. `list` result: `{ ok, command, artifacts: [{ sha256, path, sources, firstSeenAt }], total, filters? }`. `search` result: `{ ok, command, keyword, artifacts: [...], total }`. `clean` result: `{ ok, command, removed: { objects?, mirror?, snapshot? } }`.

**Rationale**: FR-009/FR-015 + consistency with the existing CLI contracts.

## 5. Testing strategy

**Decision**: Vitest. Unit: verify classification (fake repository with controlled manifest + materialized file bytes), search filtering (prefix/source-url/keyword matching on a fixture manifest), clean file removal (mock `rmSync` via `vi.mock` or use a temp directory). Integration: real git-lfs mirror (via `createTestMirror` from Stage 3) with a deliberately corrupted object; `verify` detects the corruption; `list`/`search` against a populated manifest; `clean` end-to-end (init → inspect → fetch → clean → assert state). Contract: CLI surface (commands registered, exit codes, JSON-only output).

**Rationale**: SC-001..SC-008 need both hermetic unit coverage and real-git-lfs integration (for verify's LFS object materialization path). The `createTestMirror` helper from Stage 3 already provides the mirror infrastructure.