---

description: "Task list for Stage 4 — Status / Clean feature implementation"

---

# Tasks: Status / Clean

**Input**: Design documents from `/specs/005-status-clean/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli.md

**Tests**: Tests are included per the spec (unit, integration, contract) using Vitest.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = status, US2 = clean)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Extends existing Stage 1–3 project structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the existing project is in a clean state and ready for extension

- [X] T001 Verify existing project builds and tests pass (`npm run build && npm test`)

**Checkpoint**: Project is ready for extension work

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Register `status` and `clean` commands in the CLI, update contract tests

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Register `status` command in `src/cli/index.ts` (Command with `--sha256-prefix`, `--source-url` flags and optional keyword argument, `allowExcessArguments(false)`, JSON-only output)
- [X] T003 [P] Register `clean` command in `src/cli/index.ts` (Command with `allowExcessArguments(false)`, JSON-only output)
- [X] T004 Remove `verify`, `list`, `search` from `STUB_COMMANDS` array in `src/cli/index.ts` (keep `rewrite`), replace their help text check with `status` and `clean` in `tests/contract/cli.test.ts`

**Checkpoint**: Foundation ready — `status` and `clean` are registered in CLI, contract tests pass

---

## Phase 3: User Story 1 — Show mirror status with artifact health and listing (Priority: P1) 🎯 MVP

**Goal**: `bazel-git-lfs status` reads the mirror manifest, re-computes SHA256 of each stored object, and reports every artifact's health status (`valid`/`corrupt`/`missing`) with optional filtering by `--sha256-prefix`, `--source-url`, and keyword argument.

**Independent Test**: After mirroring known artifacts, run `status` and assert all artifacts are returned with `valid` status. Tamper with one artifact and re-run `status`; assert it is reported as `corrupt` with the correct expected and actual SHA256, and the exit code is non-zero. Run `status --sha256-prefix ab12` and assert only matching artifacts are returned.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T005 [P] [US1] Unit test for status classification logic (valid/corrupt/missing) and filtering (sha256-prefix, source-url, keyword) in `tests/unit/status.test.ts`
- [X] T006 [P] [US1] Integration test for status against a real git-lfs mirror with deliberately corrupted object and filtering flags in `tests/integration/status.test.ts`

### Implementation for User Story 1

- [X] T007 [US1] Create status orchestration module in `src/mirror/status.ts` (read manifest via `ArtifactRepository.readManifest()`, stream-SHA256 each object via `sha256HexOfFile`, classify as valid/corrupt/missing, support `--sha256-prefix`/`--source-url`/keyword filtering)
- [X] T008 [US1] Create CLI status command handler in `src/cli/status.ts` (parse flags, delegate to `src/mirror/status.ts`, print JSON result, set exit code per FR-004)

**Checkpoint**: At this point, `bazel-git-lfs status` works end-to-end — reports mirror health, supports filtering, exits non-zero on corrupt/missing artifacts

---

## Phase 4: User Story 2 — Reset tool state for testing and recovery (Priority: P2)

**Goal**: `bazel-git-lfs clean` removes the local objects store, mirror working clone, and dependency snapshot while preserving the config profile and `.gitignore` entry.

**Independent Test**: Run `init` → `inspect` → `fetch` → `clean`; assert the objects store, mirror working clone, and snapshot are removed, but the config file and `.gitignore` entry remain intact. Re-run `inspect` successfully (snapshot is recreated).

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T009 [P] [US2] Unit test for clean file removal logic (idempotency, config preservation, mock fs via temp directory) in `tests/unit/clean.test.ts`
- [X] T010 [P] [US2] Integration test for clean end-to-end (init → inspect → fetch → clean → assert config preserved, state gone) in `tests/integration/clean.test.ts`

### Implementation for User Story 2

- [X] T011 [US2] Create CLI clean command handler in `src/cli/clean.ts` (init-check via `checkInitialized`, remove `objects/`, `mirror/`, `dependencies.json` via `rmSync` with `recursive: true, force: true`, preserve `config.json`, print JSON result with removed paths)

**Checkpoint**: At this point, `bazel-git-lfs clean` works end-to-end — resets local state while preserving config, idempotent

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [X] T012 Run `npm run build` to verify the project compiles without errors
- [X] T013 Run `npm test` to verify all tests pass (unit, integration, contract)
- [ ] T014 Run quickstart.md validation scenarios to verify the feature works as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) — CLI commands must be registered first
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) — CLI command must be registered first
- **Polish (Phase 5)**: Depends on both user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) — No dependencies on other stories; can run in parallel with US1

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T002 and T003 (CLI command registration) can run in parallel
- T005 and T006 (US1 tests) can run in parallel
- T009 and T010 (US2 tests) can run in parallel
- US1 (Phase 3) and US2 (Phase 4) can run in parallel after Phase 2 completes
- T012, T013, T014 (Polish) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test for status classification in tests/unit/status.test.ts"
Task: "Integration test for status in tests/integration/status.test.ts"
```

---

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together:
Task: "Unit test for clean in tests/unit/clean.test.ts"
Task: "Integration test for clean in tests/integration/clean.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (status command)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 (status) → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (clean) → Test independently → Deploy/Demo
4. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (status command)
   - Developer B: User Story 2 (clean command)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence