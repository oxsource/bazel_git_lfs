# Tasks: Discovery (inspect) — Stage 2

**Input**: Design documents from `/specs/003-discovery-inspect/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No explicit test tasks requested in the spec; each user story defines an Independent Test to verify the story works on its own.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Amendment (2026-08-29, post-implementation design session)

The design was amended after initial implementation (see spec.md Clarifications Session 2):

- The standalone `cache` command was **removed** — `inspect` persists the snapshot to `.bazel_git_lfs/dependencies.json` itself (atomic). T014a/T014b below were reworked into `runInspect`.
- `inspect` takes **no project-dir argument** (current project only; extra args → usage error) and has **no `--json` flag** — JSON is the only output; errors are JSON error objects on stdout.
- The not-initialized error is now `Not a valid bazel_git_lfs project: <dir>. Run "bazel-git-lfs init" first.`
- The source layer was renamed `src/discover/` → `src/inspect/` (`scanner.ts` → `inspector.ts`, `scanProject` → `inspectProject`, `ScanResult` → `InspectResult`); earlier task texts below keep their original wording for history.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root (extends the Stage 1 project)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the discovery module skeleton and fixtures to the existing Stage 1 project

- [x] T001 Create discovery module skeleton per plan.md (src/inspect/, tests/fixtures/projects/, tests/fixtures/bin/) in the existing project
- [x] T002 Add fixture Bazel projects under tests/fixtures/projects/ (WORKSPACE with direct http_archive, multi-URL, WORKSPACE.bazel, MODULE.bazel, empty project, and a project with dependencies in a loaded `deps.bzl`)
- [x] T003 [P] Add a mocked `bazel` binary under tests/fixtures/bin/ for hermetic query tests (per research decision 6)

**Checkpoint**: Fixtures and module skeleton in place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create Dependency and InspectResult types in src/inspect/models.ts per data-model.md (name, urls, sha256, stripPrefix, sourceFile, resolved; projectDir, dependencies, warnings, filesScanned, queryUsed, queryExternalRepos, dependencyRelations)
- [x] T005 Implement Starlark-aware extractor in src/inspect/bazel-parser.ts (extract name/urls/sha256/stripPrefix from http_archive/http_file; single url and urls list; multiline; comments) per research decision 1
- [x] T006 Implement scoped symbol table + `for`-loop/variable resolution in src/inspect/bazel-parser.ts (assignments, `for VAR in LIST:` over list-of-dicts/tuples; unresolvable → mark `resolved: false` + warning) per research decision 2 (FR-010)
- [x] T007 Implement `load()` following in src/inspect/loader.ts (parse `load("//path:file.bzl", ...)` / `load("@repo//...", ...)`; recurse into `.bzl` files; cycle-bounded; missing/unreadable target → warning) per research decision 2a (FR-001a/FR-002a)
- [x] T008 Implement Bazel query client in src/inspect/bazel-query.ts (invoke system `bazel query` via child_process with timeout; parse external-repo set + dependency relations; unavailable/failure/timeout → return `null` cleanly) per research decision 2b (FR-011)
- [x] T008a Implement dependency snapshot read/write in src/inspect/snapshot.ts (write InspectResult to `.bazel_git_lfs/dependencies.json` atomically; read it back) per research decision 3a (FR-003a/FR-013)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Inspect a Bazel project to discover remote HTTP dependencies (Priority: P1) 🎯 MVP

**Goal**: `inspect` discovers `http_archive`/`http_file` dependencies via hybrid file scanning (entry files + `load()`ed `.bzl` files, literal + loop/variable) cross-checked with Bazel query when available; read-only; requires `init` (FR-001, FR-001a, FR-002, FR-002a, FR-003, FR-004, FR-008, FR-009, FR-010, FR-011)

**Independent Test**: Run `inspect` against a fixture Bazel project (with `init` already run) whose dependencies are declared in a mix of entry files and loaded `.bzl` files (direct + loop-generated); assert the exact expected dependency set (name, URL, SHA256) is reported and no files are modified.

### Implementation for User Story 1

- [x] T009 [US1] Implement project inspection orchestration in src/inspect/inspector.ts (locate WORKSPACE/WORKSPACE.bazel/MODULE.bazel, load-follow, parse, merge; record filesScanned and sourceFile per dependency; collect warnings)
- [x] T010 [US1] Integrate Bazel query cross-check into src/inspect/inspector.ts (when query returns non-null, mark queryUsed, set queryExternalRepos + dependencyRelations; otherwise report query unavailability as a warning) per FR-011
- [x] T011 [US1] Implement the `inspect` command in src/cli/inspect.ts (init-check via Stage 1 config path helpers → error "Run `bazel-git-lfs init` first." if missing; project-dir arg defaulting to cwd; invoke scanner; render result) per FR-004/FR-007/FR-008
- [x] T012 [US1] Replace the Stage 1 `scan` stub with the real `inspect` command in src/cli/index.ts (register with Commander, exit-code handling; amended: no args, no flags) per contracts/cli.md

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Consume inspect results as structured JSON (Priority: P2)

**Goal**: `inspect` prints valid structured JSON to stdout — the only output format (no `--json` flag, no human mode); empty result exits 0 (FR-005, FR-006)

**Independent Test**: Run `inspect` against a project with dependencies; assert stdout is valid JSON with the full dependency set and snapshot path. Also assert an empty project returns an empty result with exit 0.

### Implementation for User Story 2

- [x] T013 [US2] ~~Human-readable output rendering~~ — removed by amendment: JSON is the only output; the human renderer was deleted from src/cli/inspect.ts
- [x] T014 [US2] Implement JSON output in src/cli/inspect.ts (structured `{ ok, projectDir, snapshotPath, dependencies, warnings, filesScanned, queryUsed, queryExternalRepos, dependencyRelations }`; errors as `{ ok: false, error }`; no `--json` flag) per contracts/cli.md

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Persist inspect results for fast `list` reads (Priority: P2)

**Goal**: `inspect` itself writes the discovered dependency snapshot to `.bazel_git_lfs/dependencies.json` (atomic) so later `list`/query reads are fast; no separate cache command (FR-003a, FR-013)

**Independent Test**: Run `inspect` in a fixture project; assert a snapshot file is created under `.bazel_git_lfs` with the discovered set and `snapshotPath` appears in the JSON; re-running refreshes it (idempotent overwrite).

### Implementation for User Story 3

- [x] T014a [US3] ~~Standalone `cache` command~~ — removed by amendment: snapshot persistence was merged into `runInspect` in src/cli/inspect.ts (init-check; run discovery; atomic write via inspect/snapshot.ts; `snapshotPath` in the JSON output)
- [x] T014b [US3] ~~`cache` command registration~~ — removed by amendment: src/cli/index.ts registers `inspect` only (no args, no flags, `allowExcessArguments(false)`)

**Checkpoint**: At this point, User Stories 1-3 should all work independently

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T015 [P] Implement error handling for missing/unreadable project directory (exit 1, error to stderr) in src/cli/inspect.ts per FR-007
- [x] T016 [P] Implement error handling for unparsable Bazel files (exit 1, error naming the file) in src/inspect/inspector.ts per FR-007
- [x] T017 Validate quickstart.md steps (init, inspect JSON output, empty project, not-initialized error, usage errors) against the implemented CLI
- [x] T018 Run lint, build, and typecheck across the project; fix any issues
- [x] T019 Verify `bazel-git-lfs inspect --help` and `bazel-git-lfs --help` (inspect + cache listed, scan removed) and exit codes follow the contract

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 -> P2)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - depends on models/parser/loader/query (T004-T008); independently testable
- **User Story 2 (P2)**: Depends on US1 (inspect command exists); output rendering is thin and independently testable
- **User Story 3 (P2)**: Depends on US1 (discovery) + T008a (snapshot); snapshot persistence inside `inspect` is thin and independently testable

### Within Each User Story

- Models before services
- Services before commands
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T002 (fixtures) and T003 (mocked bazel) can run in parallel within Setup
- Foundational tasks T005/T006 (parser), T008 (query client), and T008a (snapshot) touch different files and can run in parallel
- T015/T016 (error handling) can run in parallel within Polish

---

## Parallel Example: User Story 1 + 2 + 3

```bash
# Launch foundational + first stories together:
Task: "Implement Starlark parser in src/inspect/bazel-parser.ts"
Task: "Implement load() loader in src/inspect/loader.ts"
Task: "Implement Bazel query client in src/inspect/bazel-query.ts"
Task: "Implement dependency snapshot in src/inspect/snapshot.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (fixtures + skeleton)
2. Complete Phase 2: Foundational (models, parser, loader, query, snapshot)
3. Complete Phase 3: User Story 1 (inspect command)
4. **STOP and VALIDATE**: Test User Story 1 independently (fixture projects)
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 (inspect discovery) -> Test independently -> Demo
3. Add User Story 2 (JSON output) -> Test independently -> Demo
4. Add User Story 3 (snapshot persistence) -> Test independently -> Demo
5. Add Polish (Phase 6) -> Release

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify each story's Independent Test passes before moving on
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
