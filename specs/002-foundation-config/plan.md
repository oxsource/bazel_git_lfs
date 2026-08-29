# Implementation Plan: Foundation & Config

**Branch**: `002-foundation-config` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-foundation-config/spec.md`

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this implements [Stage 1 (Foundation & Config)](../001-bazel-git-lfs-guide/plan.md), covering FR-014 and FR-016.

## Summary

Stand up the `bazel-git-lfs` TypeScript/Node.js CLI project and the configuration foundation every other command depends on. Modeled on **git**: an `init` command creates a non-versioned `.bazel_git_lfs/` config directory (like `git init`); a dedicated `remote` command manages mirror-repository profiles with **project-local scope by default** and **global scope via `--global`** (git-style layering, project-local wins); a **global alias table** (`remote.alias.<name> = <url>`) lets `remote add` reference mirrors by short `@token` instead of full URLs. Includes namespace-tagged profiles, active-default selection with `--namespace` override, deterministic non-interactive config resolution for downstream commands, and a non-interactive (flag-based) setup path for CI. Credentials are fully delegated to system git (never stored).

## Technical Context

**Language/Version**: Node.js ≥ 18, TypeScript (inherited from the parent guide).

**Primary Dependencies**: Commander (CLI parsing); Node built-ins for fs/path/os; prompts for the interactive wizard (with a no-prompt fallback for non-interactive mode); `node:child_process` only where system `git` must be probed. No runtime storage framework.

**Storage**: Filesystem config store in two scopes (git-style): **project-local** at `<project>/.bazel_git_lfs/config.json` (default scope) and **global** at `~/.bazel_git_lfs/config.json` (only when `--global` is given). Each file holds profiles keyed by namespace plus an active-default marker. Resolution: project-local wins over global.

**Testing**: Vitest for unit + integration; contract tests for the CLI `init`/`--help`/`--namespace` command schemas and the profile file format.

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 22 with `git` + `git-lfs` installed, per parent guide).

**Project Type**: CLI tool (npm package foundation).

**Performance Goals**: `init` wizard completes interactively with no perceptible latency; config resolution is sub-100ms (pure local file reads).

**Constraints**: MUST NOT store or manage Git credentials (FR-010). MUST resolve config without interactive input at runtime (FR-008). MUST be configurable non-interactively for CI (FR-012). MUST apply project-local precedence over global (FR-005a). MUST default to project-local scope, using global only with `--global` (FR-004). MUST resolve `@alias` mirror URLs through the global alias table with single-level resolution (FR-013a/FR-013b). MUST validate mirror URL format only, never contacting the remote (FR-014a). MUST expose effective-config display via `remote list --effective` (FR-014). Must remain a config-only stage — no scanning/syncing/mirroring.

**Scale/Scope**: Single-user local config; few profiles (tens at most); one profile per namespace per scope; no server-side config sync in this stage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the parent guide's plan (G1–G5, from the bootstrap doc §18/§19):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → NOT APPLICABLE to this stage (no artifact handling); carried forward, not violated.
- **G2 — Non-mutation of business projects**: `scan`/`sync`/`verify`/`list`/`search` must never modify business Bazel projects. → NOT APPLICABLE here (no business-project commands in this stage); the only project write is the non-versioned `.bazel_git_lfs/` config directory created by `init`, never business source files.
- **G3 — Content-addressed deduplication**: identical content (same SHA256) stored once. → NOT APPLICABLE to this stage.
- **G4 — Backend replaceability**: discovery/cache logic not coupled to a specific storage backend. → APPLIES: profile storage is an isolated module behind a small interface so a future cloud config backend (V2) can replace local files without touching command logic.
- **G5 — Lightweight & simple**: leverage system `git`/`git-lfs`; no reimplementation of Git/LFS protocols; no heavy infra in V1. → PASS: pure Node CLI, filesystem config, no daemon/server; credentials delegated to system git (FR-008).

All applicable gates pass. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/002-foundation-config/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CLI command contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── index.ts           # command dispatch (init, remote + placeholder stubs for later stages)
│   ├── init.ts            # init command (creates .bazel_git_lfs/ + .gitignore entry)
│   ├── remote.ts          # remote command (add/list/remove/set-default/alias; wizard + flags; scope)
│   └── format.ts          # shared output helpers (human + --json, errors to stderr)
├── config/
│   ├── store.ts           # profile storage (fs-backed, behind an interface)
│   ├── profile.ts         # profile model, namespace tagging, validation
│   ├── alias.ts           # global alias table (remote.alias.*) + single-level @resolution
│   ├── resolve.ts         # effective-config resolution (project-local > global; active default / --namespace)
│   ├── scope.ts           # scope discovery: global (~/.bazel_git_lfs, requires --global) vs project-local (./.bazel_git_lfs, default)
│   └── paths.ts           # path resolution helpers
└── version.ts             # package version/help metadata

tests/
├── unit/                  # store/profile/resolve/scope/alias unit tests
├── integration/           # init + remote end-to-end with temp HOME and temp project dir
└── contract/              # CLI command schemas + profile file format
```

**Structure Decision**: Single project layout. The config layer (`config/`) is isolated behind the `ProfileStore` interface so G4 holds — the fs-backed store is the sole V1 implementation and can be swapped for cloud config in V2 without touching `cli/`. `scope.ts` implements git-style layering (project-local > global), and `resolve.ts` merges scopes before applying namespace/active selection. `cli/` orchestrates only. Other commands (scan/sync/…) exist as placeholder stubs registered in `index.ts` so `--help` lists the full command surface, matching the parent guide's contract.

## Complexity Tracking

> No constitution violations — this section intentionally left empty.
