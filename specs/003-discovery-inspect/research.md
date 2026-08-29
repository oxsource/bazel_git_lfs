# Research: Discovery (inspect)

Phase 0 research decisions resolving the technical unknowns for Stage 2.

## 1. Bazel file parsing approach

**Decision**: A lightweight, purpose-built Starlark-aware extractor focused on `http_archive` and `http_file` rule calls, rather than a full Starlark interpreter.

**Rationale**: Bazel files are Starlark (Python-like), but `inspect` only needs name/url(s)/sha256/strip_prefix from two rule types. A full interpreter is heavyweight and unnecessary (G5). A focused extractor with a small tokenizer/parser handles real-world patterns: single `url`, `urls` list, multiline calls, comments.

**Alternatives considered:** Full Starlark interpreter (e.g., a Python-in-JS engine — overkill, heavy); regex-only (fragile across formatting, poor loop handling). Chosen: a structured keyword-argument parser tolerant of list/string values and comments.

## 2. `for`-loop / variable resolution

**Decision**: Support a **scoped symbol table** evaluated top-to-bottom per file. The parser tracks simple assignments (`NAME = [ ... ]`, `NAME = "..."`) and `for VAR in LIST:` blocks that call `http_archive`/`http_file`, substituting bound variables (loop vars + list elements) into the rule's keyword arguments. It does **not** execute arbitrary Starlark (no function calls, no runtime logic). Unresolvable loop-generated declarations are reported (not silently dropped) per FR-010.

**Rationale**: FR-010 requires loop/variable resolution; a scoped symbol table over the file's static structure covers the common idioms (a list of dicts with name/url/sha256 iterated by a `for` loop) without a full interpreter. Reporting unresolvable cases keeps behavior honest (spec Edge Cases).

**Alternatives considered:** Full Starlark evaluation (overkill, violates G5/assumption); loop-unrolling only for exact literal lists (covers the common case but fails nested/dict-based loops). Chosen: symbol table covering list-of-dicts and list-of-tuples iteration, which is the dominant real-world pattern in Bazel files.

## 2a. Following `load()` into `.bzl` files

**Decision**: After locating the entry files, parse their `load("//path/to/file.bzl", ...)` and `load("@repo//path:file.bzl", ...)` statements and recursively scan the referenced `.bzl` files for `http_archive`/`http_file` declarations. The declaring file (entry vs `.bzl`) is recorded per dependency (FR-001a/FR-002a). A bounded traversal avoids cycles; missing/unreadable loaded files are reported as warnings, not fatal.

**Rationale**: Real Bazel projects declare dependencies in `.bzl` helper files loaded from the entry files — parsing only `WORKSPACE`/`MODULE.bazel` misses most declarations (per the clarification). Recording `sourceFile` supports traceability and later stages.

**Alternatives considered:** Parsing only the entry files (misses loaded declarations — rejected); requiring Bazel to expand macros (heavy, not read-only-friendly). Chosen: load-following with bounded, warning-tolerant traversal.

## 2b. Bazel-native `query` cross-check

**Decision**: When the `bazel` binary is available, invoke `bazel query` (e.g., `bazel query //external:* --output=build` and/or repo-level queries) with a timeout to obtain the authoritative set of external repositories and their dependency relationships. Compare against file-scanning results: query is authoritative for "actually used vs merely declared in loaded macros"; both sets are reported. If `bazel` is unavailable or the query fails/timeouts, fall back to file scanning alone and note that query was not used (FR-011).

**Rationale**: FR-011 + clarification. Query leverages Bazel's own evaluation to reliably determine the used external repos (avoiding false positives from loaded-but-unused macros) and surfaces dependency relationships — exactly the concern raised. The fallback keeps `inspect` working on machines without Bazel.

**Alternatives considered:** Relying solely on query (breaks when Bazel absent/fails — SC-006 wants reliable inspect); solely on file scanning (cannot authoritatively distinguish used vs merely-declared). Chosen: hybrid with query authoritative when present.

## 3. File discovery & merge

**Decision**: Look for `WORKSPACE`, `WORKSPACE.bazel`, and `MODULE.bazel` at the project root; parse whichever exist; follow `load()` into `.bzl` files (decision 2a); merge results with the source file recorded per dependency. Duplicate rule names across files are kept as separate records (`sourceFile` disambiguates) — dedup is a downstream concern.

**Rationale**: FR-001/FR-001a/FR-009 + spec Edge Cases. Recording `sourceFile` per dependency supports traceability and later stages.

**Alternatives considered:** Precedence-based overwrite (hides information); skipping when both WORKSPACE and WORKSPACE.bazel exist (Bazel itself prefers WORKSPACE.bazel — but `inspect` should report what exists).

## 3a. Dependency snapshot (cache)

**Decision**: The cache command runs the same discovery and writes the resulting `ScanResult` as a snapshot file under the project's `.bazel_git_lfs/dependencies.json`, written atomically (temp file + rename). `inspect` itself never writes (FR-003). Later `list`/query reads consume the snapshot for speed (FR-003a/FR-013).

**Rationale**: Per the clarification: keep `inspect` read-only and provide a dedicated cache command so `list` reads are fast. Atomic write prevents a partial/corrupt cache.

**Alternatives considered:** `inspect` writing automatically (violates the read-only guarantee — rejected per clarification); no cache at all (every `list` re-inspects — slow). Chosen: separate cache command + atomic snapshot.

## 4. `init` requirement check

**Decision**: `inspect`/cache check for the initialized config area using the Stage 1 config-directory path helpers (project-local `.bazel_git_lfs`). If missing, they error with "Run `bazel-git-lfs init` first." They do **not** require a mirror profile.

**Rationale**: FR-008 + SC-006. Reuses Stage 1 infra (G4). No profile needed because discovery is config-independent beyond the init check (assumption).

**Alternatives considered:** Requiring a full resolved profile (over-restrictive — discovery doesn't need the mirror); no check (violates FR-008).

## 5. Output & exit conventions

**Decision**: Default human output lists dependencies; `--json` prints structured `{ ok, projectDir, dependencies, warnings, filesScanned, queryUsed, ... }`; errors to stderr with exit codes 0 (success incl. empty), 1 (failure), 2 (usage). Reuses Stage 1 `format` helpers.

**Rationale**: FR-005/FR-006/FR-007 + contracts consistency with the Stage 1 CLI.

**Alternatives considered:** Custom exit codes per error type (unnecessary); silent empty (SC-004 wants a successful empty result — still exit 0).

## 6. Testing strategy

**Decision**: Vitest. Unit tests for the parser (literal, multiline, comments, `urls` list, `for`-loop over list-of-dicts/tuples, unresolvable loop), the loader (load-following into `.bzl`, cycle bounds, missing-file warnings), the scanner (file discovery, merge, query cross-check), and the snapshot (read/write, atomicity). Query behavior is tested with a **mocked `bazel` binary** in `tests/fixtures/bin/`. Integration tests run `inspect`/cache end-to-end against `tests/fixtures/projects/` with a temp config area. Contract tests assert `inspect`/cache human/`--json` output and exit codes.

**Rationale**: Fixtures give deterministic, reproducible discovery tests (SC-002/SC-007). Mocking `bazel` makes query tests hermetic and covers both the present and absent/fallback paths. Matches the Stage 1 testing approach.

**Alternatives considered:** Golden-file snapshots for every fixture (maintenance-heavy); only happy-path tests (misses FR-010/FR-011 error/fallback reporting). No.
