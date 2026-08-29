# Implementation Plan: Discovery (inspect)

**Branch**: `003-discovery-inspect` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-discovery-inspect/spec.md`

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this implements [Stage 2 (Discovery)](../001-bazel-git-lfs-guide/plan.md), covering FR-001, FR-002, FR-003, and FR-013 of the parent spec.

## Summary

Implement the `inspect` command in the existing `bazel-git-lfs` CLI (built in Stage 1): discovery of Bazel remote HTTP dependencies (`http_archive`/`http_file`) in the **current project** (no arguments, no flags — JSON-only output). Discovery uses a **hybrid approach**: (1) file-content inspection of `WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel` **plus `load()`ed `.bzl` files**, handling literal calls and `for`-loop/variable-generated declarations; and (2) Bazel's native **`bazel query`** (when available) as an authoritative cross-check for which external repositories are actually used and their dependency relationships. Reports per-dependency name/urls/sha256/strip_prefix/sourceFile as structured JSON (the only output format), requires an initialized config area (`init`). `inspect` persists the discovery snapshot itself to `.bazel_git_lfs/dependencies.json` (atomic) so later `list` reads are fast; it writes nothing else. No downloads, no mirroring.

## Technical Context

**Language/Version**: Node.js ≥ 18, TypeScript (inherited from parent guide + foundation stage).

**Primary Dependencies**: Commander (CLI parsing, already used); a lightweight Starlark-aware parser built on Node (no new runtime dependency — a purpose-built extractor rather than a full Starlark interpreter); system `bazel` invoked via `node:child_process` for `query` (optional, when present — fall back to file scanning if unavailable/fails); existing config modules from Stage 1 (`FsProfileStore`, `paths`, `format`). No network library needed (inspect is read-only, no downloads).

**Storage**: The discovery snapshot lives under the project's `.bazel_git_lfs/dependencies.json`, written atomically by `inspect` itself (FR-003a/FR-013); it is the only thing `inspect` writes. Config-area existence check (`init` requirement) reuses the Stage 1 config directory path helpers.

**Testing**: Vitest for unit + integration; fixture Bazel projects (WORKSPACE/WORKSPACE.bazel/MODULE.bazel + `.bzl` helper files) covering literal rules, multi-line, comments, `urls` lists, `for`-loop-generated declarations, and `load()`ed dependencies; query cross-check tested with a mocked `bazel` binary; contract tests for the `inspect` CLI schema (JSON-only output, exit codes).

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 22 with `git` + `git-lfs` installed; `bazel` optional, per parent guide).

**Project Type**: CLI tool (npm package — extension of the Stage 1 project).

**Performance Goals**: Inspect a typical Bazel project in < 5s (SC-001); file parsing is pure local I/O; `bazel query` (when used) is a single bounded invocation with a timeout/fallback; snapshot write is atomic and near-instant.

**Constraints**: `inspect` must not create/modify/delete any project file except the snapshot under `.bazel_git_lfs` (FR-003, FR-003a, FR-013). MUST require an initialized config area (FR-008) with the "not a valid bazel_git_lfs project" error otherwise. MUST operate on the current directory only — extra arguments rejected as usage errors (FR-004). MUST NOT depend on a configured mirror profile (FR-008 — init is required, but a profile is not). MUST follow `load()` into `.bzl` files (FR-001a). MUST resolve `for`-loop/variable declarations without executing arbitrary Starlark (assumption + FR-010). MUST use Bazel query when available with a clean file-inspection fallback (FR-011). MUST output JSON only (FR-006). MUST use the existing `@/` path alias and tsup build.

**Scale/Scope**: Bazel `http_archive`/`http_file` remote HTTP deps only; tens-to-hundreds of artifacts across a handful of company projects; single project per inspect invocation.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the parent guide's plan (G1–G5, from the bootstrap doc §18/§19):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → NOT APPLICABLE to this stage (no artifact handling — `inspect` is read-only discovery); carried forward, not violated.
- **G2 — Non-mutation of business projects**: `inspect`/`sync`/`verify`/`list`/`search` must never modify business Bazel projects. → APPLIES AND PASSES: the only write `inspect` performs is the snapshot under `.bazel_git_lfs` (never business source files).
- **G3 — Content-addressed deduplication**: identical content (same SHA256) stored once. → NOT APPLICABLE to this stage (no artifact storage).
- **G4 — Backend replaceability**: discovery/snapshot logic not coupled to a specific storage backend. → APPLIES AND PASSES: the discovery module is standalone and backend-agnostic; it produces a dependency model that later stages (sync/verify/rewrite) consume. It does not touch mirror backend code.
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
│   ├── index.ts           # registers inspect (replaces the scan stub from Stage 1)
│   └── inspect.ts         # inspect command (init-check, discover, persist snapshot, JSON output)
├── inspect/
│   ├── bazel-parser.ts    # Starlark-aware extractor: rule calls + for-loop/variable resolution
│   ├── loader.ts          # follow load() from entry files into .bzl files
│   ├── bazel-query.ts     # invoke `bazel query` (optional; timeout + fallback), cross-check & dependency relations
│   ├── models.ts          # Dependency, InspectResult types (shared with later stages)
│   ├── inspector.ts       # orchestrate: locate files -> load-follow -> parse -> query cross-check -> merge
│   └── snapshot.ts        # read/write the dependency snapshot under .bazel_git_lfs (atomic write)
└── config/                # (from Stage 1) paths/format reused for the init check

tests/
├── unit/                  # parser/loader/inspector/query/snapshot unit tests (incl. fixture strings)
├── integration/           # inspect end-to-end with fixture projects + temp config area
└── contract/              # CLI schema tests (command surface, exit codes)
tests/fixtures/projects/   # WORKSPACE / WORKSPACE.bazel / MODULE.bazel / *.bzl fixtures
tests/fixtures/bin/        # mocked `bazel` binary for query tests
```

**Structure Decision**: Single project layout (extension of Stage 1). The discovery layer (`inspect/`) is standalone and backend-agnostic (G4). `bazel-parser.ts` + `loader.ts` implement the file-inspection path; `bazel-query.ts` implements the optional Bazel-native cross-check (invoked via system `bazel`, with a timeout and clean fallback to file inspection per FR-011); `inspector.ts` orchestrates and merges. `cli/inspect.ts` does init-check → discover → persist snapshot (atomic, via `inspect/snapshot.ts`) → print JSON (FR-003/FR-003a/FR-006). `models.ts` defines the shared `Dependency`/`InspectResult` types that later stages (sync/verify/rewrite) consume — deliberately shared, not CLI-local. The Stage 1 `scan` stub in `cli/index.ts` is replaced with the real `inspect` command.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.
