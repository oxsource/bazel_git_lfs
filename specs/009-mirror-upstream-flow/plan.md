# Implementation Plan: Mirror Upstream Flow

**Branch**: `009-mirror-upstream-flow` | **Date**: 2026-08-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-mirror-upstream-flow/spec.md`

## Summary

Refactor `bazel-git-lfs` to use an interception/passthrough architecture. `.bazel_git_lfs/objects/` becomes an inner git repository managed via Git LFS. Only `init`, `inspect`, `clean`, and `checkout` remain custom commands; all others (fetch, push, pull, remote, status, etc.) transparently pass through to `git -C .bazel_git_lfs/objects <args>`. Pre-hooks add upstream health checks before fetch/push/pull passthrough; post-hooks add branch suggestion after remote add. `checkout` is a hybrid: `--`/`@` use custom URL replacement; `<branch>` first does git passthrough then custom patch.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js >=18

**Primary Dependencies**: commander (CLI framework), Node.js `child_process` (git operations, passthrough exec)

**Storage**: 
- `.bazel_git_lfs/objects/` — inner git repo (Git LFS managed) for dependency files
- `.bazel_git_lfs/config.json` — project config (profiles, aliases)
- `.bazel_git_lfs/dependencies.json` — snapshot from inspect

**Testing**: vitest (unit + integration)

**Target Platform**: Linux/macOS (Node.js >=18), requires `git` and `git-lfs` installed

**Project Type**: CLI tool with git passthrough

**Performance Goals**: Passthrough adds <100ms overhead; upstream check completes within 5 seconds

**Constraints**: Must work offline-gracefully (skip remote check if no network); error messages must include actionable next steps; existing commands must maintain backward compatibility

**Scale/Scope**: Single-user CLI tool

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No populated constitution gates.

## Project Structure

### Documentation (this feature)

```text
specs/009-mirror-upstream-flow/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cli.md           # CLI flag contracts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── index.ts              # Main entry — interceptor registry, passthrough logic
│   ├── interceptor.ts        # Registry: intercept (init/inspect/clean/checkout) or passthrough
│   ├── init.ts               # Custom: create .bazel_git_lfs/ → mkdir objects → git init
│   ├── inspect.ts            # Custom: scan Bazel deps, write snapshot (unchanged)
│   ├── clean.ts              # Custom: remove .bazel_git_lfs/ entirely
│   └── checkout.ts           # Custom hybrid: --/@ → custom logic; <branch> → git + patch
├── hooks/
│   ├── pre-fetch.ts          # Upstream check before fetch passthrough
│   ├── pre-push.ts           # Upstream check before push passthrough
│   ├── pre-pull.ts           # Upstream check before pull passthrough
│   └── post-remote-add.ts    # Branch suggestion after remote add passthrough
├── config/
│   ├── store.ts              # Config read/write (unchanged)
│   ├── paths.ts              # Path resolution (unchanged)
│   └── profile.ts            # Profile validation (unchanged)
├── inspect/
│   └── ...                   # Existing inspect logic (unchanged)
├── objects/
│   └── ...                   # Existing object store (simplified/removed)
├── mirror/
│   ├── repository.ts         # GitLfsRepository (simplified/replaced by passthrough)
│   ├── lfs.ts                # GitLfs wrapper (used by pre-hooks for ls-remote)
│   └── manifest.ts           # Manifest (removed, uses git directly)
├── transfer/
│   ├── fetch.ts              # Removed — passthrough to git
│   ├── push.ts               # Removed — passthrough to git
│   └── pull.ts               # Removed — passthrough to git
└── checkout/
    └── ...                   # Simplified/replaced by passthrough

tests/
├── unit/
│   ├── interceptor.test.ts   # Passthrough/interception registry tests
│   ├── init.test.ts          # Init command tests
│   ├── hooks.test.ts         # Pre/post hook tests
│   └── inspect.test.ts       # Existing inspect tests (adapted)
└── integration/
    └── upstream-flow.test.ts # End-to-end: init → remote add → fetch/push/pull
```

**Structure Decision**: Single-project layout. Existing custom modules (transfer/, mirror/, objects/) are replaced or simplified. New interceptor layer in `cli/interceptor.ts`. New `hooks/` directory for pre/post passthrough logic.

## Complexity Tracking

No constitution violations.