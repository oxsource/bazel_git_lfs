# Implementation Plan: Status / Clean

**Branch**: `005-status-clean` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-status-clean/spec.md`

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this implements [Stage 4 (Mirror Consumption)](../001-bazel-git-lfs-guide/plan.md), covering FR-010/FR-011 of the parent spec, plus the `clean` command for state reset.

## Summary

Implement the mirror consumption layer of `bazel-git-lfs`: **`status`** (check every mirrored artifact's SHA256 against the manifest — streaming, memory-bounded — and report `valid`/`corrupt`/`missing`, with optional filtering via `--sha256-prefix`, `--source-url`, and a keyword argument) and **`clean`** (reset local state: remove objects store, mirror working clone, and snapshot while preserving the config profile). Both commands are JSON-only, require `init`, and extend the existing manifest and repository abstractions from Stage 3 with no new runtime dependencies.

## Technical Context

**Language/Version**: Node.js ≥ 18, TypeScript (inherited from Stages 1–3).

**Primary Dependencies**: Node built-ins only (`node:fs/promises`, `node:stream`, `node:crypto` for SHA256); Commander (already used); Stage 3 modules (`MirrorManifest`/`parseManifest` from `mirror/manifest.ts`, `ArtifactRepository`/`GitLfsRepository` from `mirror/repository.ts`, `GitLfs` from `mirror/lfs.ts`, `ObjectsStore` from `objects/store.ts`, `sha256HexOfFile` from `objects/sha256.ts`). No new npm dependencies (G5).

**Storage**: All data is read from the existing mirror manifest (`.bazel_git_lfs/mirror/manifest.json`) and the existing objects store and LFS working clone. `status` also reads LFS objects from the mirror via the existing `ArtifactRepository.materialize()` or from the local objects store. `clean` removes the local state directories under `.bazel_git_lfs/` (objects, mirror, snapshot) via `rm -rf`-equivalent on the specific paths.

**Testing**: Vitest for unit + integration + contract. Unit: `status` classification logic (valid vs corrupt vs missing) and filtering (sha256-prefix, source-url, keyword substring), `clean` file removal (idempotency, config preservation). Integration: `status` against a real git-lfs mirror with a deliberately corrupted object (via `createTestMirror` from Stage 3 helpers) and with filtering; `clean` end-to-end (init → inspect → fetch → clean → assert config preserved, state gone). Contract: CLI surface (commands registered, exit codes, JSON-only output).

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 18 with `git` + `git-lfs` installed).

**Project Type**: CLI tool (npm package — extension of the Stage 1–3 project).

**Performance Goals**: `status` streams SHA256 (bounded memory, no full-buffering) and manifest-only read for filtering; `clean` is near-instant (rm -rf on known paths).

**Constraints**: Both commands must operate on the current project only (extra args = usage error, exit 2). MUST require `init` (FR-010/FR-016). `status` inherits the "corrupt manifest with objects → fatal error" guard from Stage 3 (FR-013). `clean` preserves the config file (FR-014). JSON-only output (FR-009/FR-015). Must reuse `@/` path alias + tsup build.

**Scale/Scope**: Tens-to-hundreds of artifacts per mirror; `status` per-artifact SHA256; `clean` operates on local filesystem only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the parent guide's plan (G1–G5):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → APPLIES AND PASSES: `status` is the integrity audit — it detects corrupt/missing artifacts and reports them; it does not modify storage. The existing G1 enforcement in `fetch`/`pull`/`push` is unchanged.
- **G2 — Non-mutation of business projects**: never modify business Bazel projects. → APPLIES AND PASSES: `status` is read-only (even with filtering); `clean` only touches the tool-owned `.bazel_git_lfs` area.
- **G3 — Content-addressed deduplication**: identical content stored once. → CARRIED FORWARD: `status` checks deduplication holds (same SHA256 → one object); `clean` is indifferent to dedup.
- **G4 — Backend replaceability**: keep the repository backend behind an `ArtifactRepository` interface. → APPLIES AND PASSES: `status` reads objects via the existing repository abstraction and parses the manifest directly (backend-agnostic format).
- **G5 — Lightweight & simple**: leverage system tools; no reimplementation of protocols. → PASS: all commands use existing built-in modules and Stage 3 abstractions; no new dependencies, no protocol reimplementation.

All applicable gates pass. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/005-status-clean/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CLI contracts)
├── checklists/          # spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root — extends the Stage 1–3 project)

```text
src/
├── cli/
│   ├── index.ts           # register status, clean commands
│   ├── status.ts          # status command entry
│   └── clean.ts           # clean command entry
├── mirror/
│   ├── status.ts          # status orchestration: read manifest, stream-SHA256 each object, classify, filter
│   └── ... (existing: lfs.ts, manifest.ts, models.ts, repository.ts)
├── objects/
│   └── ... (existing: store.ts, sha256.ts, models.ts, etc.)
├── transfer/
│   └── ... (existing: fetch.ts, push.ts, pull.ts)
├── config/
│   └── ... (existing: paths.ts, profile.ts, store.ts, resolve.ts)
└── cli/
    ├── common.ts          # shared CLI precondition helpers (from Stage 3)
    └── push-pull.ts       # shared push/pull runner (from Stage 3)

tests/
├── unit/
│   ├── status.test.ts     # status classification + filtering logic
│   └── clean.test.ts      # clean file removal logic (mock fs)
├── integration/
│   ├── status.test.ts     # status against real git-lfs mirror with corrupt object + filtering
│   └── clean.test.ts      # clean end-to-end with real temp project
├── contract/
│   └── cli.test.ts        # updated: status/clean registered, help text
└── fixtures/
    └── (existing artifacts + mirror helpers from Stage 3)
```

**Structure Decision**: Single project layout (extension of Stage 1–3). The two commands are thin CLI wrappers (status/clean) that delegate to lightweight orchestration modules in `mirror/` (status reads manifest + objects and supports filtering). No new layer is needed beyond what Stage 3 already provides. Key reuse: the existing `GitLfsRepository` (for `ensureWorkingClone` + `readManifest`), `parseManifest`/`MirrorManifest` types, `sha256HexOfFile`, and the `ObjectsStore` (for `status` cross-checking local state). Filter helpers are inlined into `mirror/status.ts` rather than a separate module. The `clean` command is a direct filesystem operation.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.