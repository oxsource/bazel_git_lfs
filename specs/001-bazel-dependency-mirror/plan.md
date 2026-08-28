# Implementation Plan: Bazel Dependency Mirror Tool

**Branch**: `001-bazel-dependency-mirror` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-bazel-dependency-mirror/spec.md`

## Summary

Build a lightweight Node.js CLI tool, `bazel-git-lfs`, that discovers Bazel remote HTTP dependencies (`http_archive`/`http_file` in `WORKSPACE`/`MODULE.bazel`), downloads them, verifies SHA256 integrity, caches by content-address, and mirrors valid artifacts into a shared Git LFS repository on self-hosted GitLab. Commands: `init`, `scan`, `sync`, `verify`, `list`, `search`, `rewrite`. Published as a public npm package. The repository backend is abstracted behind an `ArtifactRepository` interface so it can evolve to Nexus/object storage later. V2/V3 are brief roadmap only (deferred).

## Technical Context

**Language/Version**: Node.js ≥ 18 (TypeScript for type safety and maintainable CLI)

**Primary Dependencies**: Commander (CLI parsing), a Starlark/Bazel parser for WORKSPACE/MODULE.bazel, node crypto for SHA256, system `git`/`git-lfs` invoked via child_process. JSON-based manifest. 

**Storage**: Local content-addressed cache (filesystem, keyed by SHA256); Git LFS repository for mirrored artifacts; `manifest.json` + git metadata.

**Testing**: Vitest for unit + integration tests; contract tests for CLI command schemas and manifest format.

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 22 with `git` + `git-lfs` installed)

**Project Type**: CLI tool (npm package)

**Performance Goals**: Scan a typical Bazel project in < 5s; verify integrity of cached artifacts without re-downloading; idempotent re-sync is near-instant when artifacts are cached.

**Constraints**: Must NOT mutate business Bazel projects except via the dedicated `rewrite` command (dry-run default). MUST NOT store any artifact failing SHA256 verification. MUST NOT reimplement Git/Git LFS protocols (call system binaries).

**Scale/Scope**: V1 supports Bazel `http_archive`/`http_file` remote HTTP deps only; tens-to-hundreds of artifacts across a handful of company projects; single-company mirror.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the bootstrap doc (§18 success criteria, §19 core design principles):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → PASS (FR-005, FR-006)
- **G2 — Non-mutation of business projects**: `scan`/`sync`/`verify`/`list`/`search` must never modify business Bazel projects; only `rewrite` may, and only with an explicit write flag (dry-run default). → PASS (FR-013, FR-011a)
- **G3 — Content-addressed deduplication**: identical content (same SHA256) across URLs/projects stored once. → PASS (FR-006)
- **G4 — Backend replaceability**: discovery/cache logic not coupled to a specific storage backend; repository behind an interface. → PASS (FR-012)
- **G5 — Lightweight & simple**: leverage system `git`/`git-lfs`; no reimplementation of Git/LFS protocols; no heavy artifact-repo infra in V1. → PASS (FR-015, Assumptions)

All gates pass. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```
specs/001-bazel-dependency-mirror/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output (CLI command contracts)
└── tasks.md              # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
src/
├── cli/
│   └── index.ts           # command dispatch (init/scan/sync/verify/list/search/rewrite)
├── discover/
│   ├── bazel-parser.ts    # WORKSPACE/MODULE.bazel → dependency records
│   └── models.ts          # Artifact, Dependency types
├── cache/
│   └── local-cache.ts      # content-addressed cache (SHA256)
├── verify/
│   └── sha256.ts           # integrity verification
├── mirror/
│   ├── manifest.ts         # manifest.json read/write
│   └── git-lfs.ts          # GitLfsRepository (clone/lfs/add/commit/push)
├── repo/
│   └── repository.ts       # ArtifactRepository interface
├── rewrite/
│   └── rewrite.ts           # URL rewrite (dry-run default)
└── config/
    └── config.ts            # init/config management

tests/
├── unit/
├── integration/
└── contract/
```

**Structure Decision**: Single project layout. Core modules (`discover`, `cache`, `verify`, `repo`) are backend-agnostic; `mirror/git-lfs.ts` is the sole Git LFS-specific adapter implementing the `ArtifactRepository` interface. `cli/` orchestrates commands. This satisfies G4 (backend replaceability) and G1–G3.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.