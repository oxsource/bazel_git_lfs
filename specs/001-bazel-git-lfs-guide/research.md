# Research: Bazel Dependency Mirror Tool

Phase 0 research decisions resolving the technical unknowns for V1.

## 1. Bazel dependency parsing

**Decision**: Parse `WORKSPACE`, `WORKSPACE.bazel`, and `MODULE.bazel` with a lightweight, purpose-built Starlark-aware extractor focused on `http_archive` and `http_file` rule calls, rather than a full Starlark interpreter.

**Rationale**: Bazel files are Starlark (Python-like) but V1 only needs `name`, `url`/`urls`, `sha256`, and `strip_prefix` from two rule types. A full interpreter is heavyweight and unnecessary (G5 — light weight). A focused extractor with clear test fixtures covers the real-world patterns (single url, `urls` list, multiline).

**Alternatives considered:** Full Starlark interpreter (overkill); regex-only (fragile across formatting). Chosen: structured keyword-argument parser tolerant of list/string values and comments.

## 2. SHA256 & integrity

**Decision:** Use Node's built-in `crypto` (`createHash('sha256')`) for streaming hashing; always compare computed hash to the Bazel-declared `sha256`; refuse to cache/store on mismatch.

**Rationale:** Built-in, zero dependency, streamed to handle large archives without loading into memory. Enforces G1 (non-negotiable integrity).

**Alternatives considered:** External `shasum` (subprocess overhead); no — native crypto is simpler and portable.

## 3. Local cache design

**Decision:** Filesystem cache keyed by SHA256: `<cache-dir>/<sha256>` stores the artifact content; a sidecar records the source URL. Cache validated by recomputing SHA256 on read.

**Rationale:** Content-addressing by SHA256 satisfies G3 (dedup across URLs/projects). Recomputing hash on reuse defends against corruption.

**Alternatives:** URL-keyed cache (violates dedup), database cache (overkill). No.

## 4. Git LFS integration

**Decision:** Invoke system `git` and `git-lfs` via `child_process` (clone, `lfs install`, `lfs track`, `add`, `commit`, `push`). No reimplementation of Git/LFS wire protocol.

**Rationale:** Matches bootstrap §12 — leverage mature toolchain, reduce complexity (G5).

**Alternatives:** JS Git client library (complex, incomplete LFS support). No.

## 5. Repository backend abstraction

**Decision:** Define an `ArtifactRepository` interface (`exists(sha256)`, `upload(artifact)`, `download(artifact)`, `verify(artifact)`); implement `GitLfsRepository` as the sole V1 backend; route everything else through the interface.

**Rationale:** Enforces G4 (backend replaceability). Future Nexus/S3 backends plug in without touching discovery/cache.

**Alternatives:** Hard-coded Git LFS everywhere (violates G4). No.

## 6. Manifest

**Decision:** A single `manifest.json` at the mirror repo root mapping `artifact-id` → `{ source, sha256, path }`, where `artifact-id` is derived from name+version. Used for existence checks, SHA256 lookup, integrity, and auditing.

**Rationale:** Satisfies FR-009 and mirrors the bootstrap §11 design. Single source of truth for what is mirrored.

**Alternatives:** No manifest (would require scanning all LFS objects — expensive). No.

## 7. CLI framework & npm packaging

**Decision:** Use Commander for command parsing; a `bin` entry exposing `bazel-git-lfs`; publish to public npm (npmjs.org) per clarification; documented release steps (version bump → `npm publish`).

**Rationale:** Commander is standard, well-maintained, low ceremony. Matches the public-registry decision from the clarification session.

**Alternatives:** yargs/oclif (heavier). No.

## 8. Testing strategy

**Decision:** Vitest for unit + integration; dedicated contract tests validating CLI command schemas and the manifest format; fixture Bazel projects for parser and end-to-end sync.

**Rationale:** Fast, TS-native, works well with a CLI project. Contract tests pin the command interfaces.

**Alternatives:** Jest (heavier), Node test runner (less ergonomic for fixtures). No.