# Implementation Plan: Business Project Checkout

**Branch**: `005-mirror-consumption` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-business-checkout/spec.md`

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this implements [Stage 5 (Business Project Checkout)](../001-bazel-git-lfs-guide/plan.md), covering FR-011a/FR-011b/FR-013 of the parent spec.

## Summary

Implement the `checkout` command for `bazel-git-lfs`: rewrite `urls` declarations in Bazel project files (WORKSPACE/MODULE.bazel) to point at different target sources based on the given alias. Three alias types are supported: `default`/`--` (restore to original source URLs from the mirror manifest), `local`/`@` (switch to local file:// paths under `.bazel_git_lfs/objects/`), and named profile aliases (switch to that profile's configured remote URL). The command writes directly (no dry-run), prints a confirmation summary after execution, and is idempotent. A pre-commit hook installed by `init` auto-restores URLs to default before commits when a non-default alias has been applied. Reserved aliases (`default`/`local`) are defined in a shared constants module, and `remote add` validates against them.

## Technical Context

**Language/Version**: Node.js ≥ 18, TypeScript (inherited from Stages 1–4).

**Primary Dependencies**: Node built-ins only (`node:fs/promises`, `node:path`); Commander (already used); Stage 3/4 modules (`parseManifest`/`MirrorManifest` from `mirror/manifest.ts`, `ArtifactRepository`/`GitLfsRepository` from `mirror/repository.ts`, `CONFIG_DIR_NAME` from `config/paths.ts`). No new npm dependencies (G5).

**Storage**: Reads the mirror manifest (`.bazel_git_lfs/mirror/manifest.json`) for `default` restore targets and config profiles for named alias targets. The local objects store (`.bazel_git_lfs/objects/`) serves `local` target paths. Checkout state is tracked via a simple marker file (`.bazel_git_lfs/checkout-state.json`). The pre-commit hook is a git hook file installed at `.git/hooks/pre-commit`.

**Testing**: Vitest for unit + integration + contract. Unit: checkout URL resolution logic (target URL derivation per alias type), URL rewriting engine (matching and replacing in Bazel file content), idempotency, reserved alias conflict detection. Integration: checkout end-to-end against a real project with a real mirror (smoke test via `createTestMirror`/`startOriginServer` from Stage 3 helpers). Contract: CLI surface (`checkout` command registered, help text, extra-arg rejection), `remote add` rejection of reserved aliases.

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 18 with `git` + `git-lfs` installed).

**Project Type**: CLI tool (npm package — extension of the Stage 1–4 project).

**Performance Goals**: Checkout is near-instant — URL rewriting is a string operation on small Bazel files (typically < 100 lines). Manifest reading and config resolution add minimal overhead.

**Constraints**: Must operate on the current project only (extra args = usage error, exit 2). Must require `init` (FR-011). `checkout default` requires the mirror manifest (error otherwise). `checkout local` requires the objects store to exist. Must reuse `@/` path alias + tsup build. Reserved aliases must be validated at both `checkout` and `remote add` time.

**Scale/Scope**: Single Bazel project per invocation; tens of dependencies per project.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the parent guide's plan (G1–G5):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → APPLIES INDIRECTLY: `checkout` does not touch artifacts, only rewrites URL strings. The manifest is the source of truth for original URLs (restore to manifest source URLs ensures integrity).
- **G2 — Non-mutation of business projects**: never modify business Bazel projects. → APPLIES AND PASSES: `checkout` intentionally mutates Bazel files (that is its purpose), but only the `urls` declarations. The pre-commit hook auto-restores to prevent non-default URLs from being committed. This controlled mutation is explicitly gated behind `checkout default` (restore) as the safe state.
- **G3 — Content-addressed deduplication**: identical content stored once. → NOT APPLICABLE: `checkout` operates on URL strings, not artifact content.
- **G4 — Backend replaceability**: keep the repository backend behind an `ArtifactRepository` interface. → CARRIED FORWARD: `checkout` reads the manifest via the existing repository abstraction; `checkout local` resolves paths using the same object store.
- **G5 — Lightweight & simple**: leverage system tools; no reimplementation of protocols. → PASS: all operations use existing built-in modules and Stage 3/4 abstractions; URL rewriting is pattern matching on text files. No new dependencies.

All applicable gates pass. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/006-business-checkout/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CLI contracts)
├── checklists/          # spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root — extends the Stage 1–4 project)

```text
src/
├── cli/
│   ├── index.ts           # register checkout command + update remote add validation
│   ├── checkout.ts        # checkout command entry
│   └── ... (existing: init.ts, status.ts, clean.ts, format.ts, common.ts, etc.)
├── mirror/
│   ├── checkout.ts        # checkout orchestration: URL resolution, rewriting engine, alias validation
│   ├── alias.ts           # RESERVED_ALIASES constants module (default, local, --, @)
│   └── ... (existing: lfs.ts, manifest.ts, models.ts, repository.ts, status.ts)
├── config/
│   └── ... (existing: paths.ts, profile.ts, store.ts, resolve.ts — update for alias validation)
├── objects/
│   └── ... (existing: store.ts, sha256.ts, models.ts, etc.)
├── transfer/
│   └── ... (existing: fetch.ts, push.ts, pull.ts)
└── cli/
    └── ... (existing: common.ts, push-pull.ts)

tests/
├── unit/
│   ├── checkout.test.ts    # unit tests: URL resolution, rewriting, alias validation, idempotency
│   └── ... (existing: status.test.ts, clean.test.ts, etc.)
├── integration/
│   ├── checkout.test.ts    # integration: checkout end-to-end with real mirror
│   └── ... (existing: status.test.ts, clean.test.ts, etc.)
├── contract/
│   └── cli.test.ts         # updated: checkout command registered, remote add alias validation
└── fixtures/
    └── ... (existing: projects/, artifacts/, bin/ — may add fixtures)
```

**Structure Decision**: Single project layout (extension of Stage 1–4). The `checkout` command delegates to `mirror/checkout.ts` for URL resolution and rewriting logic. Reserved aliases live in `mirror/alias.ts` as a shared constants module consumed by both `cli/checkout.ts` and `cli/remote.ts`. No new layer is needed beyond what Stages 1–4 already provide.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.