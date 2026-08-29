# Implementation Plan: Recursive External Dependency Discovery & Checkout

**Branch**: `007-recursive-external-deps` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-recursive-external-deps/spec.md`

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — extends [Stage 3 (Discovery/Inspect)](../003-discovery-inspect/plan.md) and [Stage 5 (Business Project Checkout)](../006-business-checkout/plan.md).

## Summary

Make discovery and checkout work through **load chains that cross into external repositories**. When project A loads `@B//path:file.bzl` and B's bzl declares further dependencies (possibly through more layers of loads), `inspect` resolves those loads by reading B's bzl files from Bazel's working area (`bazel info output_base` → `external/`), falling back to downloading B's archive from its declared URLs and extracting it temporarily when the working area is empty. Traversal is depth-first with first-encounter ownership (identical re-declarations dedupe; divergent ones are conflicts that block). `checkout` handles these external declarations via **patch injection**: it generates one URL-only patch per external repository under the private config area and injects a `patches` attribute reference into that repository's own entry-file declaration — idempotent, exactly restorable via `checkout default`, covered by the existing pre-commit auto-restore.

## Technical Context

**Language/Version**: Node.js ≥ 18, TypeScript (inherited from Stages 1–5).

**Primary Dependencies**: Node built-ins only (`node:fs/promises`, `node:path`, `node:child_process`); existing Stage 3 parser (`inspect/bazel-parser.ts`), Stage 3/4 mirror abstractions (`mirror/repository.ts`, `objects/download.ts`), Stage 5 checkout state (`mirror/checkout.ts`). Extraction of fallback archives uses the system `tar` tool (present on macOS/Linux; bsdtar handles zip too) — no new npm dependencies (G5).

**Storage**: Reads the existing dependency snapshot (`.bazel_git_lfs/dependencies.json`, schema extended with provenance/conflict fields, backward compatible). Writes generated patches to `.bazel_git_lfs/patches/<repo>.patch` (gitignored area) and extends `.bazel_git_lfs/checkout-state.json` with injected-file/patch-list records. Temporary download fallback extracts under the OS temp dir, never inside the project's versioned tree, and is deleted after use.

**Testing**: Vitest for unit + integration + contract. Unit: external load-target parsing, sandbox path resolution (incl. Bzlmod canonical-name matching), patch generation (URL-only, deterministic), attribute injection + idempotency, DFS first-encounter dedup and conflict detection. Integration: fixture project with a pre-extracted fake sandbox; download-fallback via file:// fixture URL; end-to-end checkout → patch + injection → `checkout default` restore. Contract: extended inspect JSON fields, checkout patch output, non-zero exit on conflicts.

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 18 with `git`, `git-lfs`, optional `bazel` and `tar`).

**Project Type**: CLI tool (npm package — extension of the Stage 1–5 project).

**Performance Goals**: Sandbox-path resolution is one `bazel info output_base` invocation cached per run; patch generation is text-level (near-instant); fallback adds at most one download + extraction per unresolved repository; snapshot write remains atomic.

**Constraints**: Inspect stays read-only for the business project (temporary extraction only, outside the versioned tree, deleted after use). Checkout never touches sandbox content directly — only patches under the config area plus controlled entry-file attribute injection. Download fallback is refused for dependencies without declared sha256 (G1). WORKSPACE-style entry declarations are the first-class injection point; module-based introduction degrades to a warning (FR-016).

**Scale/Scope**: Single Bazel project per invocation; tens of dependencies; load chains bounded at depth 32; one patch file per external repository.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the parent guide's plan (G1–G5):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → APPLIES AND PASSES: the download fallback is refused when the defining dependency has no declared sha256; fallback content is used transiently to read bzl files and is never persisted into the objects store or mirror. Patches change URLs only — mirrored artifacts are byte-identical to sources, so declared digests remain valid (FR-013).
- **G2 — Non-mutation of business projects**: → APPLIES AND PASSES with the same controlled-mutation model as Stage 5: checkout mutates only entry-file declarations (adds a `patches` attribute) and generates patches under the gitignored config area. Sandbox/external content is never modified directly. `checkout default` restores exactly (state records prior content); the pre-commit hook continues to cover entry-file changes.
- **G3 — Content-addressed deduplication**: → NOT APPLICABLE: no new artifact storage; the fallback reuses existing download machinery and persists nothing.
- **G4 — Backend replaceability**: → CARRIED FORWARD: fallback downloads go through the existing `ObjectsStore`/download abstractions into temp space; no backend coupling introduced.
- **G5 — Lightweight & simple**: → PASS: sandbox location uses `bazel info` output; extraction uses system `tar`; diff generation is a small in-house line-level hunk builder (no diff libraries); no new dependencies.

All applicable gates pass. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/007-recursive-external-deps/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CLI contracts)
├── checklists/          # spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root — extends the Stage 1–5 project)

```text
src/
├── cli/
│   ├── index.ts           # (unchanged surface; inspect/checkout flags as needed)
│   ├── inspect.ts         # pass through hasConflicts → non-zero exit
│   └── checkout.ts        # wire patch orchestration into runCheckoutCommand
├── inspect/
│   ├── models.ts          # Dependency: origin/fromRepo/loadChain/alsoLoadedBy; Conflict; InspectResult.hasConflicts
│   ├── loader.ts          # resolve @repo// loads → ExternalResolver; DFS recursion; first-encounter + conflict logic
│   ├── external-resolver.ts  # NEW: sandbox location (bazel info output_base, name matching), download+extract fallback, per-run cache
│   ├── inspector.ts       # orchestrate recursive pass + query cross-check (unchanged semantics)
│   └── snapshot.ts        # schema versioning + backward-compatible read
├── mirror/
│   ├── patch.ts           # NEW: URL-only patch generation (line-level hunk builder) + patches-attribute injection/extraction
│   └── checkout.ts        # extend runCheckoutScan: external-dep targets, patch lifecycle, state extension
└── ... (existing modules unchanged)

tests/
├── unit/
│   ├── external-resolver.test.ts
│   ├── loader-external.test.ts
│   ├── patch.test.ts
│   └── ... (existing)
├── integration/
│   ├── inspect-external.test.ts
│   ├── checkout-patch.test.ts
│   └── ... (existing)
├── contract/
│   └── cli.test.ts        # extended: conflict exit codes, patch fields
└── fixtures/
    └── projects/
        └── external/      # entry file + fake-sandbox external repo fixture + file:// archive fixture
```

**Structure Decision**: Single project layout (extension of Stages 1–5). New modules: `inspect/external-resolver.ts` (sandbox + fallback resolution shared by inspect and checkout) and `mirror/patch.ts` (patch generation + attribute injection). The loader gains external-load recursion; checkout gains a patch lifecycle layer. No new layers beyond what Stages 1–5 provide.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.
