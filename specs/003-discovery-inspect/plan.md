# Implementation Plan: Discovery (inspect)

**Branch**: `003-discovery-inspect` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-discovery-inspect/spec.md`

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this implements [Stage 2 (Discovery)](../001-bazel-git-lfs-guide/plan.md), covering FR-001, FR-002, FR-003, and FR-013 of the parent spec.

## Summary

Implement the `inspect` command in the existing `bazel-git-lfs` CLI (built in Stage 1): read-only discovery of Bazel remote HTTP dependencies (`http_archive`/`http_file`). Discovery uses a **hybrid approach**: (1) file-content scanning of `WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel` **plus `load()`ed `.bzl` files**, handling literal calls and `for`-loop/variable-generated declarations; and (2) Bazel's native **`bazel query`** (when available) as an authoritative cross-check for which external repositories are actually used and their dependency relationships. Reports per-dependency name/urls/sha256/strip_prefix/sourceFile, human + `--json` output, requires an initialized config area (`init`). A separate **cache command** writes the discovery snapshot to `.bazel_git_lfs/dependencies.json` (atomic) so later `list` reads are fast; `inspect` itself stays strictly read-only. No downloads, no mirroring.

## Technical Context

**Language/Version**: Node.js ≥ 18, TypeScript (inherited from parent guide + foundation stage).

**Primary Dependencies**: Commander (CLI parsing, already used); a lightweight Starlark-aware parser built on Node (no new runtime dependency — a purpose-built extractor rather than a full Starlark interpreter); system `bazel` invoked via `node:child_process` for `query` (optional, when present — fall back to file scanning if unavailable/fails); existing config modules from Stage 1 (`FsProfileStore`, `paths`, `format`). No network library needed (inspect is read-only, no downloads).

**Storage**: The discovery snapshot (cache) lives under the project's `.bazel_git_lfs/dependencies.json`, written atomically by the cache command (FR-003a/FR-013); `inspect` itself writes nothing. Config-area existence check (`init` requirement) reuses the Stage 1 config directory path helpers.

**Testing**: Vitest for unit + integration; fixture Bazel projects (WORKSPACE/WORKSPACE.bazel/MODULE.bazel + `.bzl` helper files) covering literal rules, multi-line, comments, `urls` lists, `for`-loop-generated declarations, and `load()`ed dependencies; query cross-check tested with a mocked `bazel` binary; contract tests for the `inspect`/cache CLI schemas (human + `--json`, exit codes).

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 22 with `git` + `git-lfs` installed; `bazel` optional, per parent guide).

**Project Type**: CLI tool (npm package — extension of the Stage 1 project).

**Performance Goals**: Inspect a typical Bazel project in < 5s (SC-001); file parsing is pure local I/O; `bazel query` (when used) is a single bounded invocation with a timeout/fallback; cache write is atomic and near-instant.

**Constraints**: MUST be strictly read-only for `inspect` (FR-003) — never create/modify/delete files; only the cache command writes the snapshot (FR-003a, FR-013). MUST require an initialized config area (FR-008) with a clear error otherwise. MUST NOT depend on a configured mirror profile (FR-008 — init is required, but a profile is not). MUST follow `load()` into `.bzl` files (FR-001a). MUST resolve `for`-loop/variable declarations without executing arbitrary Starlark (assumption + FR-010). MUST use Bazel query when available with a clean file-scanning fallback (FR-011). MUST use the existing `@/` path alias and tsup build.

**Scale/Scope**: Bazel `http_archive`/`http_file` remote HTTP deps only; tens-to-hundreds of artifacts across a handful of company projects; single project per inspect invocation.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the parent guide's plan (G1–G5, from the bootstrap doc §18/§19):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → NOT APPLICABLE to this stage (no artifact handling — `inspect` is read-only discovery); carried forward, not violated.
- **G2 — Non-mutation of business projects**: `inspect`/`sync`/`verify`/`list`/`search` must never modify business Bazel projects. → APPLIES AND PASSES: `inspect` is strictly read-only (FR-003); the only write in this stage is the cache command writing a snapshot under `.bazel_git_lfs` (never business source files).
- **G3 — Content-addressed deduplication**: identical content (same SHA256) stored once. → NOT APPLICABLE to this stage (no artifact storage).
- **G4 — Backend replaceability**: discovery/cache logic not coupled to a specific storage backend. → APPLIES AND PASSES: the discovery module is standalone and backend-agnostic; it produces a dependency model that later stages (sync/verify/rewrite) consume. It does not touch mirror backend code.
- **G5 — Lightweight & simple**: leverage system tools; no reimplementation of protocols; no heavy infra in V1. → PASS: a lightweight Starlark-aware extractor (not a full interpreter), no new heavy dependencies, no network.

All applicable gates pass. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/003-discovery-inspect/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CLI command contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root — extends the Stage 1 project)

```text
src/
├── cli/
│   ├── index.ts           # registers inspect (replaces the scan stub from Stage 1) + cache command
│   ├── inspect.ts         # inspect command (init-check, discover, render human/--json; read-only)
│   └── cache.ts           # cache command (discover + write snapshot to .bazel_git_lfs, atomic)
├── discover/
│   ├── bazel-parser.ts    # Starlark-aware extractor: rule calls + for-loop/variable resolution
│   ├── loader.ts          # follow load() from entry files into .bzl files
│   ├── bazel-query.ts     # invoke `bazel query` (optional; timeout + fallback), cross-check & dependency relations
│   ├── models.ts          # Dependency, ScanResult types (shared with later stages)
│   ├── scanner.ts         # orchestrate: locate files -> load-follow -> parse -> query cross-check -> merge
│   └── snapshot.ts        # read/write the dependency snapshot under .bazel_git_lfs (atomic write)
└── config/                # (from Stage 1) paths/format reused for the init check

tests/
├── unit/                  # parser/loader/scanner/query/snapshot unit tests (incl. fixture strings)
├── integration/           # inspect/cache end-to-end with fixture projects + temp config area
└── contract/              # inspect/cache CLI schema tests (human/--json/exit codes)
tests/fixtures/projects/   # WORKSPACE / WORKSPACE.bazel / MODULE.bazel / *.bzl fixtures
tests/fixtures/bin/        # mocked `bazel` binary for query tests
```

**Structure Decision**: Single project layout (extension of Stage 1). The discovery layer (`discover/`) is standalone and backend-agnostic (G4). `bazel-parser.ts` + `loader.ts` implement the file-scanning path; `bazel-query.ts` implements the optional Bazel-native cross-check (invoked via system `bazel`, with a timeout and clean fallback to file scanning per FR-011); `scanner.ts` orchestrates and merges. `cli/inspect.ts` does init-check → discover → render (read-only, FR-003); `cli/cache.ts` runs the same discovery and persists the snapshot via `discover/snapshot.ts` (atomic write, FR-003a/FR-013). `models.ts` defines the shared `Dependency`/`ScanResult` types that later stages (sync/verify/rewrite) consume — deliberately shared, not CLI-local. The Stage 1 `scan` stub in `cli/index.ts` is replaced with the real `inspect` command.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.
