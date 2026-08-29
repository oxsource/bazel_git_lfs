# Implementation Plan: Mirror Consumption (verify / list / search / clean)

**Branch**: `005-mirror-consumption` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-mirror-consumption/spec.md`

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this implements [Stage 4 (Mirror Consumption)](../001-bazel-git-lfs-guide/plan.md), covering FR-010/FR-011 of the parent spec, plus the `clean` command for state reset.

## Summary

Implement the mirror consumption layer of `bazel-git-lfs`: **`verify`** (check every mirrored artifact's SHA256 against the manifest — streaming, memory-bounded — and report `valid`/`corrupt`/`missing`), **`list`** (output all manifest entries as JSON with optional `--sha256-prefix` and `--source-url` filters), **`search`** (case-insensitive substring match across artifact names, paths, and source URLs), and **`clean`** (reset local state: remove objects store, mirror working clone, and snapshot while preserving the config profile). All four commands are JSON-only, require `init`, and extend the existing manifest and repository abstractions from Stage 3 with no new runtime dependencies.

## Technical Context

**Language/Version**: Node.js ≥ 18, TypeScript (inherited from Stages 1–3).

**Primary Dependencies**: Node built-ins only (`node:fs/promises`, `node:stream`, `node:crypto` for SHA256); Commander (already used); Stage 3 modules (`MirrorManifest`/`parseManifest` from `mirror/manifest.ts`, `ArtifactRepository`/`GitLfsRepository` from `mirror/repository.ts`, `GitLfs` from `mirror/lfs.ts`, `ObjectsStore` from `objects/store.ts`, `sha256HexOfFile` from `objects/sha256.ts`). No new npm dependencies (G5).

**Storage**: All data is read from the existing mirror manifest (`.bazel_git_lfs/mirror/manifest.json`) and the existing objects store and LFS working clone. `verify` also reads LFS objects from the mirror via the existing `ArtifactRepository.materialize()` or from the local objects store. `clean` removes the local state directories under `.bazel_git_lfs/` (objects, mirror, snapshot) via `rm -rf`-equivalent on the specific paths.

**Testing**: Vitest for unit + integration + contract. Unit: `verify` classification logic (valid vs corrupt vs missing), `list`/`search` filtering (sha256-prefix, source-url, keyword substring), `clean` file removal (idempotency, config preservation). Integration: `verify` against a real git-lfs mirror with a deliberately corrupted object (via `createTestMirror` from Stage 3 helpers); `list`/`search` against a populated manifest; `clean` end-to-end (init → inspect → fetch → clean → assert config preserved, state gone). Contract: CLI surface (commands registered, exit codes, JSON-only output).

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 18 with `git` + `git-lfs` installed).

**Project Type**: CLI tool (npm package — extension of the Stage 1–3 project).

**Performance Goals**: `verify` streams SHA256 (bounded memory, no full-buffering); `list`/`search` are manifest-only reads (no LFS object transfer) and complete in < 1s for typical mirrors; `clean` is near-instant (rm -rf on known paths).

**Constraints**: All four commands must operate on the current project only (extra args = usage error, exit 2). MUST require `init` (FR-010/FR-016). `verify` inherits the "corrupt manifest with objects → fatal error" guard from Stage 3 (FR-013). `clean` preserves the config file (FR-014). JSON-only output (FR-009/FR-015). Must reuse `@/` path alias + tsup build.

**Scale/Scope**: Tens-to-hundreds of artifacts per mirror; `verify` per-artifact SHA256; `list`/`search` read the in-memory manifest (a few hundred KB at most); `clean` operates on local filesystem only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the parent guide's plan (G1–G5):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → APPLIES AND PASSES: `verify` is the integrity audit — it detects corrupt/missing artifacts and reports them; it does not modify storage. The existing G1 enforcement in `fetch`/`pull`/`push` is unchanged.
- **G2 — Non-mutation of business projects**: never modify business Bazel projects. → APPLIES AND PASSES: `verify`/`list`/`search` are read-only; `clean` only touches the tool-owned `.bazel_git_lfs` area.
- **G3 — Content-addressed deduplication**: identical content stored once. → CARRIED FORWARD: `verify` checks deduplication holds (same SHA256 → one object); `list`/`search`/`clean` are indifferent to dedup.
- **G4 — Backend replaceability**: keep the repository backend behind an `ArtifactRepository` interface. → APPLIES AND PASSES: `verify` reads objects via the existing repository abstraction; `list`/`search` parse the manifest directly (backend-agnostic format).
- **G5 — Lightweight & simple**: leverage system tools; no reimplementation of protocols. → PASS: all commands use existing built-in modules and Stage 3 abstractions; no new dependencies, no protocol reimplementation.

All applicable gates pass. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/005-mirror-consumption/
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
│   ├── index.ts           # register verify, list, search, clean commands
│   ├── verify.ts          # verify command entry
│   ├── list.ts            # list command entry
│   ├── search.ts          # search command entry
│   └── clean.ts           # clean command entry
├── mirror/
│   ├── verify.ts          # verify orchestration: read manifest, stream-SHA256 each object, classify
│   ├── search.ts          # manifest search/filter helpers (prefix, source-url, keyword)
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
│   ├── verify.test.ts     # verify classification logic
│   ├── search.test.ts     # list/search filtering + keyword matching
│   └── clean.test.ts      # clean file removal logic (mock fs)
├── integration/
│   ├── verify.test.ts     # verify against real git-lfs mirror with corrupt object
│   ├── list-search.test.ts# list/search against populated manifest
│   └── clean.test.ts      # clean end-to-end with real temp project
├── contract/
│   └── cli.test.ts        # updated: verify/list/search/clean registered, help text
└── fixtures/
    └── (existing artifacts + mirror helpers from Stage 3)
```

**Structure Decision**: Single project layout (extension of Stage 1–3). The four new commands are thin CLI wrappers (verify/list/search/clean) that delegate to lightweight orchestration modules in `mirror/` (verify reads manifest + objects, search filters the manifest). No new layer is needed beyond what Stage 3 already provides. Key reuse: the existing `GitLfsRepository` (for `ensureWorkingClone` + `readManifest`), `parseManifest`/`MirrorManifest` types, `sha256HexOfFile`, and the `ObjectsStore` (for `verify` cross-checking local state). The `clean` command is a direct filesystem operation.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.