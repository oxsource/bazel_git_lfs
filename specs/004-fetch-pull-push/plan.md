# Implementation Plan: Mirroring Core (fetch / pull / push)

**Branch**: `004-fetch-pull-push` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-fetch-pull-push/spec.md`

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this implements [Stage 3 (Mirroring Core)](../001-bazel-git-lfs-guide/plan.md), covering FR-004/FR-005/FR-006/FR-007/FR-008/FR-009/FR-012/FR-015/FR-016 of the parent spec. The parent guide's single `sync` command is superseded by the git-style trio `fetch` / `pull` / `push`.

## Summary

Implement the mirroring core of `bazel-git-lfs` as three git-style commands replacing the `sync` stub: **`fetch`** (origin→local: download snapshot dependencies from their declared URLs, stream-verify SHA256, store content-addressed artifacts under `.bazel_git_lfs/objects/`), **`push`** (local→remote: upload local objects to the configured Git LFS mirror via system `git`/`git-lfs`, update the mirror's `manifest.json`, commit/push — idempotent), and **`pull`** (remote→local: transfer snapshot dependencies from the mirror manifest into the local objects store — mirror-only, strict `not-in-mirror` errors, never touches origin URLs). Objects are stored in a Maven-style reversed-domain layout (`objects/<reversed-host>/<org>/<repo>/<sha256>`, e.g. `https://github.com/facebook/react/...` → `objects/com/github/facebook/react/<sha256>`). All three are JSON-only, require `init` + the `inspect` snapshot, and enforce integrity (G1) at every entry point: nothing hash-mismatched or missing-SHA256 is ever stored locally or remotely.

## Technical Context

**Language/Version**: Node.js ≥ 18, TypeScript (inherited from parent guide + Stages 1–2).

**Primary Dependencies**: Node built-ins only for fetch (`node:fetch` global, `node:crypto` for streaming SHA256, `node:fs/promises`, `node:child_process` for system `git`/`git-lfs`); Commander (already used); Stage 1 config modules (`ConfigResolver` for the default remote profile, `paths`, `format`); Stage 2 `FsSnapshotStore` for the dependency snapshot. No new runtime dependencies (G5 — no reimplementation of Git/LFS protocols; system tools only).

**Storage**: Local content-addressed objects store at `.bazel_git_lfs/objects/<reversed-host>/<org>/<repo>/<sha256>` (Maven-style layout, derived from the dependency's primary URL); atomic writes (temp + verify + rename). Mirror side: a real Git + Git LFS repository holding `objects/**` (LFS-tracked) plus `manifest.json` (SHA256 → object path, source URLs) — the authoritative record of mirror contents. A disposable LFS working clone of the mirror lives under `.bazel_git_lfs/mirror/` (fully recoverable; the objects store and the mirror are the sources of truth). The mirror repository backend stays behind an `ArtifactRepository` interface (Git LFS is the initial implementation, G4).

**Testing**: Vitest for unit + integration + contract. Unit: object-path derivation (all URL shapes incl. edge cases), store put/has/verify/atomicity, manifest read/merge, download retry-across-urls. Integration: `fetch`/`push`/`pull` end-to-end against a **real local git + git-lfs repository** (temp bare mirror initialized with `git init` + `git lfs install`, with `git config` LFS skippable hooks where needed) and a **local `node:http` server** serving artifact bytes as the "origin" (Node fetch does not support `file://`); corrupt-artifact, missing-SHA256, missing-local, not-in-mirror, and idempotent-re-push cases; mocked `git` failure injection for error paths. Contract tests: CLI surface (commands, exit codes, JSON-only output).

**Target Platform**: macOS / Linux developer & CI machines (Node.js ≥ 18 with `git` + `git-lfs` installed).

**Project Type**: CLI tool (npm package — extension of the Stage 1–2 project).

**Performance Goals**: `fetch` streams downloads (bounded memory, no full-buffering of large archives); `push`/`pull` are near-instant when everything is already mirrored/cached (idempotent skip); re-push with nothing new creates no commit.

**Constraints**: All three commands MUST operate on the current project only (extra args = usage error, exit 2). MUST require `init` + persisted snapshot (FR-013); `pull`/`push` additionally require a configured default remote profile (FR-012). MUST NOT store/verify/propagate artifacts failing SHA256 or missing SHA256 (FR-002, G1 non-negotiable). `push` MUST NOT download from origin (FR-007); `pull` MUST NOT contact origin URLs (FR-010). MUST NOT manage git credentials (FR-016 — system credential helpers only). JSON-only output (FR-018). Must reuse `@/` path alias + tsup build.

**Scale/Scope**: Tens-to-hundreds of artifacts per project across a handful of company projects; artifacts up to ~1 GiB streamed; single project per invocation; cross-project dedup via the shared mirror.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The `.specify/memory/constitution.md` is an unfilled template; gates are derived from the parent guide's plan (G1–G5, from the bootstrap doc §18/§19):

- **G1 — Integrity (non-negotiable)**: No artifact whose SHA256 mismatches its declared value may ever be stored or mirrored. → APPLIES AND PASSES BY DESIGN: `fetch` verifies before storing and rejects `missing-sha256`; `pull` verifies mirror-sourced objects on arrival; `push` only uploads local store entries (which are verified-by-construction). Corrupt local entries are treated as absent and re-fetched.
- **G2 — Non-mutation of business projects**: never modify business Bazel projects. → APPLIES AND PASSES: the only writes are under `.bazel_git_lfs/` (objects store, LFS working clone, temp files).
- **G3 — Content-addressed deduplication**: identical content stored once. → APPLIES AND PASSES: objects keyed by SHA256 end to end (FR-014) — one local file, one mirror object, manifest accumulates source URLs.
- **G4 — Backend replaceability**: keep the repository backend behind an `ArtifactRepository` interface. → APPLIES AND PASSES: `mirror/repository.ts` defines the interface; `GitLfsRepository` is the initial implementation; `objects/` store and `transfer/` orchestration are backend-agnostic.
- **G5 — Lightweight & simple**: leverage system tools; no reimplementation of protocols. → PASS: system `git`/`git-lfs` via `child_process` (FR-015); origin downloads via the standard global `fetch`; no new npm dependencies.

All applicable gates pass. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/004-fetch-pull-push/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CLI + manifest contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root — extends the Stage 1–2 project)

```text
src/
├── cli/
│   ├── index.ts           # register fetch/pull/push (remove the sync stub)
│   ├── fetch.ts           # fetch command: init+snapshot checks → transfer → JSON output
│   ├── pull.ts            # pull command: + default-profile check → transfer → JSON output
│   └── push.ts            # push command: + default-profile check → transfer → JSON output
├── objects/
│   ├── models.ts          # ObjectRef, per-dependency statuses (fetched/cached/failed, ...)
│   ├── object-path.ts     # URL → Maven-style reversed-domain object path (deterministic)
│   ├── sha256.ts          # streaming SHA256 (hash file / hash stream)
│   ├── store.ts           # objects store: has/verify/get/put (atomic temp+rename), list
│   └── download.ts        # origin download: URL list fallback, stream-to-temp, verify
├── mirror/
│   ├── models.ts          # MirrorManifest, ManifestEntry types
│   ├── manifest.ts        # read/validate/merge/serialize manifest.json (atomic)
│   ├── lfs.ts             # system git/git-lfs invocations (clone/fetch/lfs pull/track/add/commit/push), timeouts
│   └── repository.ts      # ArtifactRepository interface + GitLfsRepository implementation
└── transfer/
    ├── fetch.ts           # fetch orchestration: snapshot → missing → download → store → result
    ├── pull.ts            # pull orchestration: snapshot + manifest → missing-in-mirror → lfs fetch → verify → store
    └── push.ts            # push orchestration: snapshot + local store + manifest → upload → merge manifest → commit/push
config paths/profile/resolve (Stage 1) and inspect/snapshot (Stage 2) are reused as-is.

tests/
├── unit/                  # object-path, store, sha256, manifest, download (mocked fetch), orchestrators (injected fakes)
├── integration/           # end-to-end fetch/push/pull against real git+git-lfs temp mirror + local http origin
└── contract/              # CLI schema tests (command surface, exit codes, JSON-only output)
tests/fixtures/projects/   # fixture projects (reuse Stage 2 fixtures + snapshot files)
tests/fixtures/artifacts/  # fixture artifact payloads with known SHA256 (incl. a deliberately corrupt variant)
tests/fixtures/bin/        # mocked/failing `git`-like binaries for failure-injection tests
```

**Structure Decision**: Single project layout (extension of Stage 1–2). Three layers keep gates satisfied: `objects/` (local content-addressed store — backend-agnostic, G3/G1), `mirror/` (remote backend behind `ArtifactRepository`, G4; `lfs.ts` is the only place invoking system git/git-lfs, FR-015), `transfer/` (per-command orchestration shared by CLI entry points, consuming the Stage 2 snapshot and Stage 1 profile resolution — G4 reuse). CLI commands stay thin: checks (init → snapshot → default profile) → orchestrate → JSON. The `sync` stub is removed from `cli/index.ts` and `fetch`/`pull`/`push` registered in its place (FR-019).

## Complexity Tracking

> No constitution violations — this section intentionally left empty.
