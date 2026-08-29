# Implementation Plan: Bazel Dependency Mirror Tool

**Branch**: `001-bazel-dependency-mirror` | **Date**: 2026-08-28 (rev. 2026-08-29) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-bazel-dependency-mirror/spec.md`

## Summary

Build a lightweight CLI tool, `bazel-git-lfs`, implemented in **TypeScript on Node.js**, that discovers Bazel remote HTTP dependencies (`http_archive`/`http_file` in `WORKSPACE`/`MODULE.bazel`), downloads them, verifies SHA256 integrity, caches by content-address, and mirrors valid artifacts into a shared Git LFS repository on self-hosted GitLab. Commands: `init`, `scan`, `sync`, `verify`, `list`, `search`, `rewrite`. Published as a public npm package.

**Scope of this plan**: This plan focuses ONLY on how the requirements are split into delivery stages and roughly what each stage does. It deliberately does NOT analyze specific tasks, module structure, or code-level design — the detailed work for each stage will be analyzed in a separate design planning guide (参照本次建议单独设计规划指导分析完成).

## Stage Overview

The V1 requirements are split into **6 sequential stages**, each independently reviewable and independently plan-able. Each stage ends with a working, verifiable slice of the tool.

| Stage | Name | Core focus | Requirement coverage |
|-------|------|-----------|----------------------|
| 1 | Foundation & Config | Project scaffold, CLI skeleton, `init` + profile/config management | FR-014, FR-016 |
| 2 | Discovery | `scan` — parse Bazel projects, extract HTTP deps (read-only) | FR-001, FR-002, FR-003, FR-013 |
| 3 | Mirroring Core | `sync` — download, verify, cache, upload to Git LFS, manifest | FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-012, FR-015 |
| 4 | Mirror Consumption | `verify`, `list`, `search` — query & integrity-check the mirror | FR-010, FR-011 |
| 5 | Business Project Rewrite | `rewrite` — point business projects at mirror URLs (dry-run default) | FR-011a, FR-011b, FR-013 |
| 6 | Packaging & Release | npm package setup, documentation, repeatable release process | FR-014a, FR-014b |

## Stage Details

### Stage 1 — Foundation & Config

**设计规划指导**: [tasks.md T001](./tasks.md) — pending design planning guide link (待创建)

- **Objective**: Stand up the TypeScript/Node.js project and the configuration foundation every other command depends on.
- **Roughly what it does**:
  - Project scaffold (package.json, TypeScript build, test setup, CLI command dispatch with `init`).
  - `init` interactive wizard collecting mirror repo URL, GitLab host, and Git LFS settings, saved as a local profile tagged by namespace in a Maven-style global config directory (`~/.bazel-git-lfs`).
  - Active-profile selection with `--namespace` override; credentials fully delegated to system git (no secrets stored).
- **Exit signal**: `bazel-git-lfs init` creates/updates a profile; subsequent commands can resolve the active config.

### Stage 2 — Discovery (`scan`)

**设计规划指导**: [tasks.md T002](./tasks.md) — pending design planning guide link (待创建)

- **Objective**: Read-only discovery of a Bazel project's remote HTTP dependencies.
- **Roughly what it does**:
  - Parse `WORKSPACE`, `WORKSPACE.bazel`, and `MODULE.bazel`; extract `http_archive`/`http_file` rules with name, URL(s), declared SHA256, strip prefix.
  - Report a dependency inventory with no downloads, uploads, or file modifications.
- **Exit signal**: `scan` returns the exact expected dependency set for fixture projects (incl. empty and multi-URL cases) without side effects.

### Stage 3 — Mirroring Core (`sync`)

**设计规划指导**: [tasks.md T003](./tasks.md) — pending design planning guide link (待创建)

- **Objective**: The core business value — mirror artifacts into the shared Git LFS repository.
- **Roughly what it does**:
  - Download missing artifacts, stream-compute SHA256, reject mismatches (never cache/store failures).
  - Maintain a content-addressed local cache (keyed by SHA256) and reuse cached artifacts.
  - Support multiple projects in one invocation with cross-project dedup.
  - Upload valid artifacts to the Git LFS mirror via system `git`/`git-lfs`; maintain `manifest.json` (source, SHA256, mirror path); commit/push.
  - Keep the repository backend behind an `ArtifactRepository` interface (Git LFS is the initial implementation).
- **Exit signal**: First-time sync populates the mirror; re-sync is idempotent (no duplicate uploads); hash mismatch is rejected.

### Stage 4 — Mirror Consumption (`verify`, `list`, `search`)

**设计规划指导**: [tasks.md T004](./tasks.md) — pending design planning guide link (待创建)

- **Objective**: Query and audit what is already in the mirror.
- **Roughly what it does**:
  - `verify` checks mirrored artifacts against recorded SHA256 and flags corruption.
  - `list`/`search` display the mirror inventory and filter by keyword.
- **Exit signal**: Tampered artifact is reported as corrupt; inventory queries return correct artifacts.

### Stage 5 — Business Project Rewrite (`rewrite`)

**设计规划指导**: [tasks.md T005](./tasks.md) — pending design planning guide link (待创建)

- **Objective**: Let business projects consume the mirror by rewriting their URLs.
- **Roughly what it does**:
  - Rewrite `urls` in Bazel files from public URLs to mirror URLs, **dry-run by default**; an explicit flag writes files.
  - Only rewrite dependencies already present in the mirror; touch nothing else.
- **Exit signal**: Dry-run previews changes without writing; write mode updates only target URLs; un-mirrored deps left untouched.

### Stage 6 — Packaging & Release

**设计规划指导**: [tasks.md T006](./tasks.md) — pending design planning guide link (待创建)

- **Objective**: Distribute the tool.
- **Roughly what it does**:
  - npm package setup with `bazel-git-lfs` binary, published to public npm (npmjs.org).
  - Documented, repeatable release steps (version bump → publish).
- **Exit signal**: `npm install -g bazel-git-lfs` makes the CLI invocable; a release can be produced repeatably.

## Technical Context

**Language/Version**: Node.js ≥ 18, TypeScript.

**Primary Dependencies**: Commander (CLI parsing), a lightweight Starlark-aware Bazel-file extractor, Node `crypto` for SHA256, system `git`/`git-lfs` via `child_process`. JSON-based manifest.

**Storage**: Local content-addressed cache (filesystem, keyed by SHA256); Git LFS repository for mirrored artifacts; `manifest.json` in the mirror repo.

**Testing**: Vitest for unit + integration tests; contract tests for CLI command schemas and manifest format.

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 22 with `git` + `git-lfs` installed).

**Performance Goals**: Scan a typical Bazel project in < 5s; verify cached artifacts without re-downloading; idempotent re-sync is near-instant when cached.

**Constraints**: MUST NOT mutate business Bazel projects except via `rewrite` (dry-run default). MUST NOT store any artifact failing SHA256 verification. MUST NOT reimplement Git/Git LFS protocols (call system binaries). MUST NOT store Git credentials (system credential helpers / SSH keys only).

**Scale/Scope**: Bazel `http_archive`/`http_file` remote HTTP deps only; tens-to-hundreds of artifacts across a handful of company projects; single-company mirror. Mavenrepo-style cloud config is deferred to V2.

## Constitution Check

*GATE: Must pass before any stage starts. Re-check after each stage's design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the bootstrap doc (§18 success criteria, §19 core design principles):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → PASS (FR-005, FR-006)
- **G2 — Non-mutation of business projects**: `scan`/`sync`/`verify`/`list`/`search` must never modify business Bazel projects; only `rewrite` may, and only with an explicit write flag (dry-run default). → PASS (FR-013, FR-011a)
- **G3 — Content-addressed deduplication**: identical content (same SHA256) across URLs/projects stored once. → PASS (FR-006)
- **G4 — Backend replaceability**: discovery/cache logic not coupled to a specific storage backend; repository behind an interface. → PASS (FR-012)
- **G5 — Lightweight & simple**: leverage system `git`/`git-lfs`; no reimplementation of Git/LFS protocols; no heavy artifact-repo infra in V1. → PASS (FR-015, FR-016, Assumptions)

All gates pass. No violations requiring complexity justification.

## Notes on Downstream Analysis

- This plan ends at the stage level. **Specific tasks, module layout, and code-level design for each stage are intentionally NOT specified here.**
- Each stage is intended to be analyzed in its own dedicated design planning guide (设计规划指导), referencing this plan's stage as the source of scope and exit signals.
- Stage → design planning guide linkage is tracked in [tasks.md](./tasks.md): one checklist item per stage, each pointing to its 设计规划指导. When a stage's design planning guide is delivered, its task is checked off and the link filled in.
- Design artifacts previously generated for reference: [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md), [contracts/](./contracts/). Their level of detail may be split or reworked per-stage as those separate design planning guides are written.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.
