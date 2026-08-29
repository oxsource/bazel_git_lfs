# Tasks: Recursive External Dependency Discovery & Checkout

**Input**: Design documents from `specs/007-recursive-external-deps/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/cli.md, quickstart.md

**Tests**: Included per user story to ensure independent testability.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root (project convention extends Stages 1–5)
- Paths are shown with absolute file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create foundational shared modules and fixture that all user stories depend on.

- [X] T001 [P] Create external test fixture in `tests/fixtures/projects/external/`: WORKSPACE with http_archive and load("@B//:deps.bzl", ...), plus a pre-extracted fake-sandbox external directory at `tests/fixtures/sandbox/external/B/` containing a bzl file with dependency declarations
- [X] T002 [P] Create a file:// archive fixture (B.tar.gz) at `tests/fixtures/artifacts/B.tar.gz` for the download fallback test, with matching sha256 stored in a fixture declaration
- [X] T003 [P] Extend `src/inspect/models.ts` with new Dependency fields: `origin: 'entry' | 'external-bzl'`, `fromRepo: string | null`, `loadChain: string[]`, `alsoLoadedBy: string[][]`; add `DependencyConflict` interface and `schemaVersion: 2` + `conflicts: DependencyConflict[]` + `hasConflicts: boolean` to `InspectResult`; export default-value coercers for backward-compatible reads

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented. All three user stories need the ExternalResolver.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create `src/inspect/external-resolver.ts`: sandbox-path resolution via `bazel info output_base` (child_process exec, 30s timeout, cached), external directory listing with tolerant repo-name matching (exact match for WORKSPACE-era, prefix+`~`/`+` for Bzlmod canonical names, `bazel mod dump_repo_mapping ""` fallback); per-run resolution cache keyed by repo name
- [X] T005 Extend `src/inspect/external-resolver.ts` with download-and-extract fallback: refuse if no declared sha256 (G1), download first reachable URL to OS temp file, verify sha256, extract via system `tar` (detect format), return extracted rootDir with `temp: true`, clean up in `finally`; reuse `objects/download.ts` pattern for the network fetch
- [X] T006 [P] Export the `ExternalResolver` class from `src/inspect/external-resolver.ts` with a `resolve(repoName: string): Promise<ResolutionResult>` method returning `{status, rootDir, temp, sourceDep}`; export a `ResolutionResult` interface for use by loader and checkout

**Checkpoint**: Foundation ready — external repositories can be resolved (sandbox or fallback); models carry provenance fields

---

## Phase 3: User Story 1 — Discover external dependencies via inspect (Priority: P1) 🎯 MVP

**Goal**: `inspect` resolves `@repo//path:file.bzl` loads, reads bzl files from sandbox or download fallback, and discovers dependencies declared inside those bzl files with full provenance.

**Independent Test**: Point inspect at the external fixture project; assert the nested dependency (declared in the fake-sandbox bzl) appears in the snapshot with `origin: "external-bzl"`, `fromRepo: "B"`, and a non-empty `loadChain`. Repeat with no sandbox directory (simulate by pointing BAZEL_OUTPUT_BASE at an empty area) and a file:// URL for the fallback archive; assert identical discovery.

### Tests for User Story 1 ⚠️

- [X] T007 [P] [US1] Unit tests for `external-resolver.ts` sandbox resolution in `tests/unit/external-resolver.test.ts`: mock `bazel info output_base` output, verify exact-match and Bzlmod-tolerant-name directory lookup, verify cache returns same result on second call
- [X] T008 [P] [US1] Unit tests for `external-resolver.ts` download fallback in `tests/unit/external-resolver-download.test.ts`: mock download to a known-good archive fixture, verify extraction + bzl readability, ensure cleanup runs on success and on error
- [X] T009 [P] [US1] Unit tests for loader `@repo//` load-target parsing in `tests/unit/loader-external.test.ts`: verify `resolveLoadTarget` returns `{repo, path}` for `@repo//pkg:file.bzl` and `@repo//path/file.bzl` forms, returns `null` for non-bzl targets
- [X] T010 [US1] Integration test for inspect with sandbox in `tests/integration/inspect.test.ts`: create actual fixture with pre-extracted sandbox dir, run inspect, assert nested dependency discovered with provenance

### Implementation for User Story 1

- [X] T011 [US1] Update `src/inspect/loader.ts`: change `resolveLoadTarget` to return `{repo: string, path: string} | null` for `@repo//...` loads (instead of returning null); add recursive-loading logic: when a load targets an external repo, call `ExternalResolver.resolve(repo)`, then read bzl from the resolved rootDir + path, parse with existing parser, and recurse over its loads (DFS); use `visitedFiles` keyed by `repoName + ':' + path`
- [X] T012 [US1] Add provenance tracking to `src/inspect/loader.ts`: pass a `loadChain: string[]` through the recursion; when a dependency is discovered in an external bzl, set `origin: 'external-bzl'`, `fromRepo: repo`, `loadChain: [...loadChain, '@repo//:path']`
- [X] T013 [US1] Update `src/inspect/inspector.ts` to pass through the new fields from loader without any transformation (they flow through to the InspectResult)
- [X] T014 [US1] Update `src/inspect/snapshot.ts`: on write, include `schemaVersion: 2` and the new `conflicts`/`hasConflicts` fields; on read, coerce missing fields to defaults (v1 → v2 compatibility); no breaking change
- [X] T015 [US1] Update `src/cli/inspect.ts`: inspect output already passes through all InspectResult fields — verify `hasConflicts` surfaces and `conflicts[]` renders; set `process.exitCode = EXIT_ERROR` when `hasConflicts: true`

**Checkpoint**: US1 fully functional — recursive external-dependency discovery works via sandbox and download fallback; snapshot carries provenance and schema version

---

## Phase 4: User Story 2 — DFS traversal with first-encounter ownership and conflict blocking (Priority: P2)

**Goal**: Identical re-declarations dedupe with provenance merge; divergent re-declarations produce conflict errors that block inspect (exit non-zero) and checkout (refuse to generate patches).

**Independent Test**: Fixture with two load chains declaring the same external repository. Identical content: produce one record with `alsoLoadedBy`. Divergent URLs: exit non-zero, snapshot flagged with `hasConflicts`. Checkout targeting that repo: error exit with actionable message.

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] Unit tests for deduplication in `tests/unit/loader-external.test.ts`: fixture with two load chains → same dependency name, identical urls/sha256 → assert single record with `alsoLoadedBy` set, zero conflicts
- [X] T017 [P] [US2] Unit tests for conflict detection in `tests/unit/loader-external.test.ts`: same fixture but divergent urls → assert `DependencyConflict` recorded, `hasConflicts: true`, exit code 1
- [X] T018 [US2] Integration test for conflict in `tests/integration/inspect.test.ts`: add fixture with divergent re-declarations, verify inspect writes flagged snapshot and exits non-zero
- [X] T019 [US2] Integration test for cycle detection in `tests/integration/inspect.test.ts`: add cycle fixture (A→B→A via loads), verify traversal stops gracefully with a warning

### Implementation for User Story 2

- [X] T020 [US2] Add first-encounter conflict bookkeeping to `src/inspect/loader.ts`: maintain a `declarations` map keyed by dependency name (within the scope of the current external repo or globally?) — by dep name globally since repo+dep is the dedup key; on first encounter, record the normalized tuple `{urls(sorted), sha256, stripPrefix}`; on second encounter, compare; if identical → push current loadChain into `alsoLoadedBy`; if divergent → create `DependencyConflict` and set `hasConflicts`
- [X] T021 [US2] Add cycle/loop detection to `src/inspect/loader.ts`: the existing `visitedFiles` set already prevents re-scanning the same file; add a depth counter parameter, increment on each recursive load call, fail-stop with a warning at depth ≥ 32 (FR-008)
- [X] T022 [US2] Wire conflicts through to `InspectResult`: assign `conflicts: DependencyConflict[]` and `hasConflicts: boolean` in the loader output; update `emptyInspectResult` defaults
- [X] T023 [US2] Update `src/cli/inspect.ts` to exit non-zero when `result.hasConflicts` (FR-007)
- [X] T024 [US2] Ensure `src/mirror/checkout.ts` receives conflict info: when reading the snapshot, reject checkout if any dependency belongs to a conflicted repository (FR-015); surface error in `patches: []` / `error` field

**Checkpoint**: US2 complete — DFS ownership, dedup, conflict detection, cycle protection, and conflict blocking in checkout

---

## Phase 5: User Story 3 — Checkout applies external dependencies via patch injection (Priority: P3)

**Goal**: For external-bzl dependencies, checkout generates an audit patch file under `.bazel_git_lfs/patches/`, injects a marker-tagged `patch_cmds` command into the entry-file declaration of the defining external repository, and records state for exact restore. Conflicted repos abort the run; unresolvable repos are skipped with warning.

**Independent Test**: Fixture with external dependency — checkout with a non-default alias → assert patch file created with URL-only rewrites, entry declaration gains a `patch_cmds` command with the marker. Re-run same alias → idempotent (no stacked commands). `checkout default` → patch file removed, entry declaration restored.

### Tests for User Story 3 ⚠️

- [X] T025 [P] [US3] Unit tests for patch generation in `tests/unit/patch.test.ts`: provide bzl content with an `http_archive(name="X", urls=["OLD"], ...)`, call patch generator, assert produced unified diff contains only URL-line changes; provide content with multiple deps, assert sorted/deterministic output; provide content already at target URLs, assert no patch generated
- [X] T026 [P] [US3] Unit tests for `patch_cmds` injection in `tests/unit/patch.test.ts`: provide entry-file content with an `http_archive(name="B", ...)`, call injector, assert marker-tagged shell command appears inside declaration; provide same content again, assert no stacking; provide content with existing marker command for different alias, assert replacement
- [X] T027 [P] [US3] Unit tests for patch extraction/reset in `tests/unit/patch.test.ts`: provide entry-file content with a marker command, call extraction function (checkout default), assert command removed and entry content restored; assert audit patch file removal logic
- [X] T028 [US3] Integration test for checkout-patch end-to-end in `tests/integration/checkout-patch.test.ts`: full fixture with external repo + sandbox, run checkout with a local/remote alias, assert patch file created under persisted config area temp (or mockable), entry file modified with patch_cmds marker; run checkout default, assert entry restored and patch deleted
- [X] T029 [US3] Contract test for checkout output in `tests/contract/cli.test.ts`: extend existing checkout contract tests — assert `patches` array present (empty for pure-tree projects, populated for external-dep projects), `skipped` array for unresolvable repos, non-zero exit for conflicted repos

### Implementation for User Story 3

- [X] T030 [US3] Create `src/mirror/patch.ts`: implement `generatePatch(bzlContent: string, depChanges: CheckoutChange[]): string` — rewrite the bzl content using name-anchored URL replacement (reuse `replaceDependencyUrl` pattern), produce a minimal unified diff between original and rewritten content (in-house line-level LCS hunk builder); return empty string if unchanged
- [X] T031 [US3] In `src/mirror/patch.ts`: implement `injectPatchCmds(entryContent: string, repo: string, pathInsideRepo: string, oldUrls: string[], newUrls: string): string` — find the http_archive declaration for `repo` by name, add a `patch_cmds` key with our marker-tagged shell command: `# bazel-git-lfs:checkout <repo>\n    sed "s|<old-url>|<new-url>|g" <path> > <path>.bgl_tmp && mv <path>.bgl_tmp <path>`; dedup by marker prefix (replace existing matching marker commands, skip identical ones)
- [X] T032 [US3] In `src/mirror/patch.ts`: implement `removePatchCmds(entryContent: string): string` — strip any lines matching our marker prefix or the entire patch_cmds argument block (preserving syntax); implement `removeAuditPatches(projectDir: string, state: CheckoutState): Promise<void>` — delete audit patch files listed in state
- [X] T033 [US3] Extend `src/mirror/checkout.ts`: add `runExternalDepCheckout` function that, for each external-bzl dependency group: re-resolve the declaring repo via `ExternalResolver`, read bzl, generate patch via `patch.ts`, audit-patch-write to `.bazel_git_lfs/patches/<repo>.patch`, inject patch_cmds into entry content, collect results into `patches: PatchRecord[]` and `skipped` arrays; respect conflict check (FR-015)
- [X] T034 [US3] Extend `src/mirror/checkout.ts` CheckoutState: add `patches: {repo, injectedIn, command, patchFile}[]` to the state interface; update `writeCheckoutState` / `readCheckoutState` / `removeCheckoutState` to handle the new field (read `patches: []` default for v1 state)
- [X] T035 [US3] Update `src/cli/checkout.ts`: wire the external-dep checkout into `runCheckoutCommand` after the existing project-tree scan; pass `patches` and `skipped` arrays into the JSON output; integrate with checkout-state lifecycle (write/remove patches state alongside alias state)
- [X] T036 [US3] Verify pre-commit hook compatibility: the existing auto-restore runs `checkout default` which triggers `removePatchCmds` + `removeAuditPatches` — no changes to the hook script itself (FR-017)

**Checkpoint**: US3 complete — external dependencies are rewired via patch injection, exactly restorable, respecting conflicts and idempotency

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and documentation updates.

- [X] T037 [P] Run existing test suite: `npm test` — verify no regressions in Stage 1–5 tests
- [X] T038 Run typecheck: `npm run typecheck` — resolve any type errors
- [X] T039 Run lint: `npm run lint` — resolve any lint issues
- [X] T040 Run quickstart.md validation against the external fixture

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately (T001–T003 run in parallel)
- **Foundational (Phase 2)**: Depends on Setup — T004/T005 run sequentially (build resolver), T006 runs parallel (export)
- **User Stories (Phase 3+)**: All depend on Foundation completion
  - **US1 (Phase 3)**: Can start after Foundation — T007–T009 (tests) can run in parallel with T011–T015 (implementation) after core resolver is done
  - **US2 (Phase 4)**: Depends on US1 completion for the loader to have recursive-load infrastructure; T016–T017 (tests) parallel with T020–T024 (implementation)
  - **US3 (Phase 5)**: Depends on US1 for ExternalResolver sharing, and US2 for conflict-checking; T025–T027 (tests) parallel with T030–T036 (implementation) after resolver stable
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundation — No dependencies on other stories → **MVP scope**
- **US2 (P2)**: Depends on US1 (recursive-load infrastructure) — independently testable with US1 already in place
- **US3 (P3)**: Depends on US1 + US2 (ExternalResolver + conflict check) — independently testable with US1+US2 done

### Within Each User Story

- Tests (where included) describe expected behavior but need not be written strictly before implementation — the project convention (existing test pattern) is to write unit tests alongside implementation; integration tests verified after
- Core implementation before integration tests
- Story complete before moving to next priority

### Parallel Opportunities

- Phase 1: T001, T002, T003 run in parallel (different fixture files and model file)
- Phase 2: T006 (export only) runs in parallel with T004+T005
- Phase 3: T007–T010 (tests) can start after T004–T005; T011–T014 (implementation) can run in parallel with each other but sequential within loader (T011 then T012)
- Phase 4: T016–T017 (tests) parallel with T020–T024 (loader changes sequential)
- Phase 5: T025–T027 (tests) parallel with T030–T032 (patch.ts sequential); T034 (state) parallel with T033 (checkout orchestration)

---

## Parallel Example: User Story 1

```bash
# Phase 3 parallel batch after T004–T005 are done:
Task: T007 "Unit test: external-resolver sandbox resolution"
Task: T008 "Unit test: external-resolver download fallback"
Task: T009 "Unit test: loader @repo// load-target parsing"
Task: T011 "Update loader.ts @repo// load resolution"
Task: T013 "Update inspector.ts pass-through"
Task: T014 "Update snapshot.ts schema v2"

# Then sequential within loader:
Task: T012 "Add provenance tracking in loader.ts"  # depends on T011
Task: T015 "Update cli/inspect.ts hasConflicts exit"  # depends on loader changes

# Integration test after all implementation:
Task: T010 "Integration test for inspect with sandbox"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run `npm test` — inspect discovers external deps
5. `bazel-git-lfs inspect` on a real project with recursive loads works

### Incremental Delivery

1. Setup + Foundation → Resolver ready (external repos resolvable from sandbox or download)
2. Add US1 (inspect recursive discovery) → Test independently → MVP deliverable
3. Add US2 (DFS ownership + conflict blocking) → Test independently → Deliver
4. Add US3 (checkout patch injection) → Test independently → Deliver
5. Polish → Final verification

### Parallel Team Strategy

With multiple developers:
1. Developer A: Phase 1 (fixtures + models) → Phase 3 US1 (loader + inspect)
2. Developer B: Phase 2 (external-resolver core) → Phase 4 US2 (conflict logic)
3. Developer C: Phase 5 US3 (patch generation + checkout integration) — starts after resolver stable
4. All: Phase 6 Polish together

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Tests describe expected behavior; project convention allows writing implementation alongside tests
- Commit after each logical task group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence