# Tasks: Mirroring Core (fetch / pull / push) — Stage 3

**Input**: Design documents from `/specs/004-fetch-pull-push/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per plan.md's Testing strategy (Vitest unit + integration + contract); each user story also defines an Independent Test in spec.md.

**Organization**: Tasks are grouped by user story (US1 fetch → origin→local, US2 push → local→remote, US3 pull → remote→local) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root (extends the Stage 1–2 project)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the mirroring module skeletons and shared fixtures to the existing project

- [x] T001 Create module skeletons per plan.md structure (src/objects/, src/mirror/, src/transfer/) alongside the existing src/inspect/ and src/config/ modules
- [x] T002 [P] Add fixture artifact payloads with known SHA256 under tests/fixtures/artifacts/ (a valid tarball-like payload, a second distinct payload, and a deliberately corrupt variant) with a small script or checked-in manifest listing their digests
- [x] T003 [P] Add a local HTTP origin test server helper (node:http serving fixture bytes with status-code/EOF-error injection) under tests/fixtures/ for download tests (Node fetch does not support file://)
- [x] T004 [P] Add a git+git-lfs test mirror helper under tests/helpers/ (create temp bare repo, `git init` working clone + `git lfs install` locally scoped, `.gitattributes` tracking, commit helpers) per research decision 4/10 (note: helper + its smoke tests are guarded by `gitLfsAvailable()` and skip on machines without git-lfs; self-check validated via tests/unit/test-mirror.test.ts and tests/unit/origin-server.test.ts)

**Checkpoint**: Fixtures and module skeleton in place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create shared result/status types in src/objects/models.ts per data-model.md (ObjectRef; per-dependency statuses fetched/cached/uploaded/already-mirrored/missing-local/pulled/not-in-mirror/failed with reason union; summary counts shape per contracts/cli.md)
- [x] T006 [P] Implement URL → Maven-style reversed-domain object path derivation in src/objects/object-path.ts per research decision 1 (URL parser; reversed lowercased host segments + URL path directories minus filename; segment sanitization `[a-z0-9._-]`; fallback single bucket for non-parsable/IP/port URLs with warning flag)
- [x] T007 [P] Implement streaming SHA256 helpers in src/objects/sha256.ts (hash a file, hash a Node Readable stream) per research decision 2
- [x] T008 Implement the local objects store in src/objects/store.ts per data-model.md (ObjectsStore: pathFor/has with SHA256 re-verification/get/put with temp+verify+mkdir+rename atomicity/size) per research decision 3 (FR-003, FR-004, FR-005)
- [x] T009 [P] Create mirror manifest types in src/mirror/models.ts per data-model.md (MirrorManifest { version, updatedAt, objects }, ManifestEntry { path, sources, firstSeenAt })
- [x] T010 Implement mirror manifest read/validate/merge/serialize in src/mirror/manifest.ts per research decision 5 (union sources by SHA256; preserve path/firstSeenAt; missing/corrupt-manifest handling: empty-with-warning only when no objects exist, else abort error; atomic serialization) (FR-020)
- [x] T011 Implement system git/git-lfs invocations in src/mirror/lfs.ts per research decision 4 (execFile with argument arrays, no shell interpolation; timeouts; captured stderr; GIT_LFS_SKIP_SMUDGE=1 for clone; operations: clone, fetch, reset-clean (fetch + reset --hard + clean -fd), lfsTrack, lfsPullInclude, add, commit, pull-rebase, push, revParse)
- [x] T012 Define the ArtifactRepository interface and GitLfsRepository implementation in src/mirror/repository.ts per plan.md (G4: interface exposing readManifest/ensureWorkingClone/upload/copyFromMirror; GitLfsRepository composes src/mirror/lfs.ts + manifest.ts; working clone at `.bazel_git_lfs/mirror/`, disposable, reset-or-reclone before use)
- [x] T013 [P] Add fixture artifact payloads registration into a test origin helper (serve tests/fixtures/artifacts bytes with a path→fixture map; used by fetch integration tests) under tests/helpers/

**Checkpoint**: Foundation ready (store, path derivation, manifest, git-lfs client, repository abstraction) - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Fetch dependencies from origin into the local objects store (Priority: P1) 🎯 MVP

**Goal**: `fetch` downloads snapshot dependencies from declared origin URLs into `.bazel_git_lfs/objects/` with streaming SHA256 verification, atomic storage, URL fallback, cache reuse, and corrupt-entry re-download (FR-001..FR-006, FR-013)

**Independent Test**: In a fixture project with `init` + snapshot referencing a local HTTP origin, run `fetch`; assert objects appear under expected reversed-domain paths, corrupt downloads/missing-SHA256 deps are rejected and not stored, and a second run reports `cached` with no network requests.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [P] [US1] Unit tests for object-path derivation in tests/unit/object-path.spec.ts (URL matrix: github.com deep path, multi-level TLD, bare-host, IP/port/query fallback → sanitized bucket + warning, filename exclusion, dedup for identical sha256)
- [x] T015 [P] [US1] Unit tests for ObjectsStore in tests/unit/objects-store.spec.ts (put is atomic and verified; has re-verifies and treats corrupt entry as absent; get returns path; put failure leaves no partial file) (FR-004, FR-005)
- [x] T016 [P] [US1] Unit tests for origin download in tests/unit/download.spec.ts with mocked global fetch (URL list tried in order; first success wins; hash mismatch → rejected + next URL; all fail → `no-url-succeeded`; missing sha256 → `missing-sha256` without any request; network error classified) per research decision 2 (FR-002, FR-006)

### Implementation for User Story 1

- [x] T017 [US1] Implement origin download in src/objects/download.ts (global fetch, stream body to temp file while hashing, verify before rename, URL-list fallback, per-URL error capture) (FR-001, FR-002, FR-004, FR-006)
- [x] T018 [US1] Implement fetch orchestration in src/transfer/fetch.ts (read snapshot via Stage 2 FsSnapshotStore; per dependency: missing-sha256 → fail; has() → cached; else download → store put → fetched; continue past failures; summary counts; non-zero outcome when any failed) per FR-001/FR-005/FR-006/FR-013
- [x] T019 [US1] Implement the `fetch` CLI command in src/cli/fetch.ts (init-check → snapshot check → no profile needed → orchestrate → JSON result `{ ok, command: "fetch", projectDir, objectsDir, results, summary }`; fatal errors `{ ok: false, error }` exit 1; extra args → usage exit 2) per contracts/cli.md (FR-013, FR-018)
- [x] T020 [US1] Register the `fetch` command in src/cli/index.ts with Commander (no args, no flags, `allowExcessArguments(false)`, exit-code handling)
- [x] T021 [US1] Integration test for fetch end-to-end in tests/integration/fetch.spec.ts (temp project + local http origin + temp config area: 3 deps fetched to expected paths; corrupt origin bytes → failed + nothing stored; identical sha256 across two deps → one stored file; re-fetch → all cached with no origin hits recorded)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently (G1 gate: no unverified byte is ever stored)

---

## Phase 4: User Story 2 - Push local objects to the remote mirror (Priority: P1)

**Goal**: `push` is a pure local→remote transport: uploads locally present snapshot objects to the configured default mirror via system git/git-lfs, merges manifest.json, commits and pushes; idempotent; missing-local reported without failing (FR-007, FR-008, FR-009, FR-012, FR-015, FR-016, FR-020)

**Independent Test**: After `fetch`, run `push` against a temp bare git-lfs mirror; assert the mirror gains objects + manifest.json and a commit; re-run `push` → all `already-mirrored`, `pushed: false`, no new commit; a dep absent locally → `missing-local` without failing the run.

### Tests for User Story 2

- [x] T022 [P] [US2] Unit tests for manifest merge in tests/unit/manifest.spec.ts (new entry; same sha256 different URL → sources union, same path; updatedAt refreshed; corrupt manifest with existing objects → abort error) per research decision 5

### Implementation for User Story 2

- [x] T023 [US2] Implement push orchestration in src/transfer/push.ts (init/clone/reset working clone via repository; ensure `objects/**` LFS tracking; resolve per-dependency: already-mirrored by manifest lookup / missing-local / uploaded; copy objects into clone; merge manifest; commit only when changed; pull --rebase before push; capture commit id and pushed flag) per FR-007/FR-008/FR-009/FR-020
- [x] T024 [US2] Implement the `push` CLI command in src/cli/push.ts (init-check → snapshot check → effective default profile via Stage 1 ConfigResolver → orchestrate → JSON `{ ok, command: "push", projectDir, remote, commit, pushed, results, summary }`; missing-local alone exits 0) per contracts/cli.md (FR-009, FR-012, FR-018)
- [x] T025 [US2] Register the `push` command in src/cli/index.ts (replace the `sync` stub: remove sync, register fetch/pull/push — combined with T027 if sequencing prefers)
- [x] T026 [US2] Integration test for push end-to-end in tests/integration/push.spec.ts with the git-lfs mirror helper (fetch→push round trip: mirror objects + manifest + commit; re-push idempotent no new commit; missing-local dep reported, others still pushed; no default profile → JSON error; rejected git push → failure with re-run hint via stub git in tests/fixtures/bin/) (FR-008, FR-009)

**Checkpoint**: At this point, the P1 pipeline `fetch → push` populates a real mirror; re-push is idempotent (SC-002)

---

## Phase 5: User Story 3 - Pull dependencies from the remote mirror into the local store (Priority: P2)

**Goal**: `pull` transfers snapshot dependencies from the mirror manifest into the local objects store via system git/git-lfs, verifying SHA256 on arrival; mirror-only (never origin); strict `not-in-mirror` errors (FR-010, FR-011, FR-012)

**Independent Test**: After a successful fetch+push from project A, run `pull` in a fresh initialized copy of the project (same snapshot, no local objects); assert all objects arrive with valid SHA256, zero origin requests, and mirror-missing deps fail with `not-in-mirror`.

### Tests for User Story 3

- [x] T027 [P] [US3] Unit tests for pull orchestration logic in tests/unit/pull-orchestration.spec.ts with injected fakes (manifest hit → pulled; local cache valid → cached without transfer; corrupt local entry → re-fetch from mirror; manifest miss → not-in-mirror failing result; corrupt mirror object → failed, not stored) per research decision 6 (FR-011)

### Implementation for User Story 3

- [x] T028 [US3] Implement pull orchestration in src/transfer/pull.ts (resolve snapshot deps against repository.readManifest; classify cached/pulled/not-in-mirror; materialize via lfsPull --include for needed paths; verify SHA256 on arrival; atomic put into local store; non-zero outcome when any not-in-mirror/failed) (FR-010, FR-011)
- [x] T029 [US3] Implement the `pull` command in src/cli/pull.ts (init-check → snapshot check → default profile → orchestrate → JSON `{ ok, command: "pull", projectDir, objectsDir, remote, results, summary }`) per contracts/cli.md (FR-012, FR-018)
- [x] T030 [US3] Register the `pull` command in src/cli/index.ts and remove the `sync` stub from STUB_COMMANDS (verify `verify/list/search/rewrite` stubs remain) per FR-019
- [x] T031 [US3] Integration test for the full round trip in tests/integration/round-trip.spec.ts (fetch+push in project A → fresh project B copy with same snapshot: pull → 3× pulled, local stores byte-identical, zero origin requests (assert origin server received no fetch-project-B requests); dep absent from manifest → not-in-mirror + exit 1; re-pull → all cached) per SC-003

**Checkpoint**: All user stories independently functional (SC-001..SC-005 covered)

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T032 [P] Implement shared CLI precondition helpers (init-check message reuse from Stage 1; snapshot-missing error `no dependency snapshot, run "bazel-git-lfs inspect" first`; default-profile resolution error passthrough) extracted into src/cli/common.ts and used by fetch/pull/push per FR-012/FR-013
- [x] T033 [P] Harden interruption recovery: verify working-clone reset/re-clone path in src/mirror/repository.ts covers dirty clone, interrupted push, and corrupt checkout (unit tests with stub git state) per research decision 8 (SC-007)
- [x] T034 [P] Contract test for the command surface in tests/contract/cli-surface.spec.ts (fetch/pull/push registered with no args/flags; sync absent; extra args → exit 2; JSON-only stdout; help text lists all commands) per FR-017/FR-018/FR-019
- [x] T035 Validate quickstart.md steps end-to-end (init → remote → inspect → fetch → push → idempotent re-push → pull in fresh copy) against the implemented CLI
- [x] T036 Run lint, build, and typecheck across the project; fix any issues
- [x] T037 Verify `bazel-git-lfs --help` and each command's `--help` output and exit codes follow the contract (fetch/pull/push listed, sync absent)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories (T005–T013)
- **US1 fetch (Phase 3)**: Depends on Foundational; no dependency on other stories (needs only snapshot + origin)
- **US2 push (Phase 4)**: Depends on Foundational; practically pairs after US1 (push consumes local objects; testable with fixtures placed manually if US1 pending)
- **US3 pull (Phase 5)**: Depends on Foundational; full round-trip test (T031) requires US1+US2 complete
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundational → T017 → T018 → T019/T020; independently testable (no mirror needed)
- **User Story 2 (P1)**: Foundational → T022 → T023/T024/T025; mirrors and idempotence independently testable
- **User Story 3 (P2)**: Foundational → T027 (tests first) → T028 → T029/T030; end-to-end proof needs US1+US2

### Within Each User Story

- Models/types before services (transfer orchestration) before commands
- Unit tests written first and failing (T014–T016, T022, T027) before implementation tasks
- Story complete before moving to next priority

### Parallel Opportunities

- Setup: T002/T003/T004 (different fixture/helper files) in parallel
- Foundational: T006 (object-path), T008 (sha256), T009 (models), T011 (lfs), T013 (origin helper) all touch different files — parallel
- US1 unit tests T014/T015/T016 in parallel
- T022 (manifest unit tests) parallel with US1 implementation
- T027 (pull unit tests) parallel with US2 implementation
- Polish: T032/T033/T034 in parallel

---

## Parallel Example: Foundational + US1

```bash
# Launch foundational modules together (different files):
Task: "Implement object path derivation in src/objects/object-path.ts"
Task: "Implement streaming SHA256 in src/objects/sha256.ts"
Task: "Implement ObjectsStore in src/objects/store.ts"
Task: "Implement system git/git-lfs wrapper in src/mirror/lfs.ts"

# Then US1 tests, then US1 implementation:
Task: "Unit tests for origin download in tests/unit/download.spec.ts"
Task: "Implement fetch orchestration in src/transfer/fetch.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (helpers + fixtures)
2. Complete Phase 2: Foundational (models, path, sha256, store, manifest, lfs, repository)
3. Complete Phase 3: User Story 1 (fetch command)
4. **STOP and VALIDATE**: `fetch` populates `.bazel_git_lfs/objects/` with verified artifacts from origin — G1 enforced, no mirror required

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 fetch → validate independently (origin→local works)
3. US2 push → validate independently (local→mirror works; re-push idempotent)
4. US3 pull → validate round trip (mirror→local, mirror-only, strict errors)
5. Polish → quickstart validation → lint/typecheck/build clean

### Notes

- Integrity gate (G1) is enforced in both transfer directions at store `put` time: nothing unverified ever lands in `objects/` or the mirror
- The `sync` stub removal (T025/T030) must land before the contract test T034 passes
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
