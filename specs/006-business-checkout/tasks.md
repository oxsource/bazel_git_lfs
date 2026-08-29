---

description: "Task list for Stage 5 — Business Project Checkout feature implementation"

---

# Tasks: Business Project Checkout

**Input**: Design documents from `/specs/006-business-checkout/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli.md

**Tests**: Tests are included per the spec (unit, integration, contract) using Vitest.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = checkout, US2 = pre-commit hook)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Extends existing Stage 1–4 project structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the existing project is in a clean state and ready for extension

- [X] T001 Verify existing project builds and tests pass (`npm run build && npm test`)

**Checkpoint**: Project is ready for extension work

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Reserved aliases constants module, remote add validation, contract test updates

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Create reserved aliases constants module in `src/mirror/alias.ts` (export `RESERVED_ALIASES` with `default`/`--`/`local`/`@`, and helper `isReservedAlias(name)`/`assertNotReserved(name)`)
- [X] T003 [P] Update `remote add` and `remote alias add` in `src/cli/remote.ts` to validate alias names against `isReservedAlias()` and reject with a clear error
- [X] T004 Register `checkout` command in `src/cli/index.ts` (positional `<alias>` argument, no flags, `allowExcessArguments(false)`, JSON and human-readable output)
- [X] T005 Update contract test in `tests/contract/cli.test.ts` to verify `checkout` command is registered, `remote add` rejects reserved aliases, and help text is correct

**Checkpoint**: Foundation ready — reserved aliases defined, CLI registered, contract tests pass

---

## Phase 3: User Story 1 — Switch project URLs to a target source (Priority: P1) 🎯 MVP

**Goal**: `bazel-git-lfs checkout <alias>` rewrites `urls` declarations in WORKSPACE/MODULE.bazel to the target source determined by the alias.

**Independent Test**: Run checkout with each alias type (default, local, profile-alias) against a fixture project; assert files are updated to correct target URLs, confirmation summary is printed, and nothing else is changed.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] [US1] Unit test for URL resolution and rewriting engine in `tests/unit/checkout.test.ts` (alias resolution per type, pattern matching, idempotency, confirmation output)
- [X] T007 [P] [US1] Integration test for checkout end-to-end against a real mirror in `tests/integration/checkout.test.ts`

### Implementation for User Story 1

- [X] T008 [US1] Create checkout orchestration module in `src/mirror/checkout.ts` (alias resolution, target URL derivation per alias type, URL rewriting engine with pattern matching, idempotency check, confirmation output generation)
- [X] T009 [US1] Create CLI checkout command handler in `src/cli/checkout.ts` (parse alias argument, init-check, delegate to `src/mirror/checkout.ts`, print result or confirmation)

**Checkpoint**: At this point, `bazel-git-lfs checkout <alias>` works end-to-end for all three alias types

---

## Phase 4: User Story 2 — Pre-commit hook auto-restore on init (Priority: P2)

**Goal**: `init` installs a git pre-commit hook that detects non-default checkout state and auto-restores URLs before commits.

**Independent Test**: After init + checkout <alias>, attempt a git commit; assert the hook runs `checkout default` automatically and the commit succeeds with original URLs restored.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T010 [P] [US2] Unit test for checkout state management and pre-commit hook logic in `tests/unit/checkout.test.ts` (state file read/write/remove, hook auto-restore detection)
- [X] T011 [P] [US2] Integration test for pre-commit hook end-to-end in `tests/integration/checkout.test.ts` (init → checkout → commit → assert restore)

### Implementation for User Story 2

- [X] T012 [US2] Implement checkout state management in `src/mirror/checkout.ts` (read/write/remove `.bazel_git_lfs/checkout-state.json`, update state on checkout execution)
- [X] T013 [US2] Update `src/cli/init.ts` to install a pre-commit git hook (write `.git/hooks/pre-commit` script that checks state and runs `checkout default`)

**Checkpoint**: At this point, both checkout and the auto-restore hook work end-to-end

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [X] T014 Run `npm run build` to verify the project compiles without errors
- [X] T015 Run `npm test` to verify all tests pass (unit, integration, contract)
- [X] T016 Run quickstart.md validation scenarios to verify the feature works as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) — CLI commands and reserved aliases must be registered first
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) + checkout implementation (US1) — hook needs checkout command to exist
- **Polish (Phase 5)**: Depends on both user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 — the pre-commit hook calls `checkout default` internally

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T002 and T003 (alias module + remote validation) can run in parallel
- T006 and T007 (US1 tests) can run in parallel
- T010 and T011 (US2 tests) can run in parallel
- T014, T015, T016 (Polish) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test for checkout in tests/unit/checkout.test.ts"
Task: "Integration test for checkout in tests/integration/checkout.test.ts"

# Launch alias module + remote validation together:
Task: "Create reserved aliases module in src/mirror/alias.ts"
Task: "Update remote add validation in src/cli/remote.ts"
```

---

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together:
Task: "Unit test for checkout state in tests/unit/checkout.test.ts"
Task: "Integration test for pre-commit hook in tests/integration/checkout.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (checkout command)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 (checkout) → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (hook) → Test independently → Deploy/Demo
4. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (checkout command)
   - Developer B: User Story 2 (pre-commit hook — after US1 is ready)
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