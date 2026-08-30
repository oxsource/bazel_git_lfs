---

description: "Task list for mirror upstream flow feature"
---

# Tasks: Mirror Upstream Flow

**Input**: Design documents from `/specs/009-mirror-upstream-flow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: No test tasks are generated — tests are not explicitly requested in the specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US2)
- Include exact file paths in descriptions

## Path Conventions

All paths are relative to repository root. Single-project layout: `src/`, `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency setup

- [ ] T001 Create feature branch `009-mirror-upstream-flow` from main
- [ ] T002 Install any missing dependencies (`npm install`) and verify `npm run build` passes

---

## Phase 2: Foundational — Interception/Passthrough Architecture

**Purpose**: Core interception registry, passthrough logic, and custom command stubs. MUST be complete before any user story can begin.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 [P] Implement `src/cli/interceptor.ts`: interception registry with `lookup(cmd)` and `passthrough(args)` methods. `passthrough` delegates to `git -C .bazel_git_lfs/objects <args>` via `child_process.execFileSync`. Registry initially empty.
- [ ] T004 [P] Refactor `src/cli/index.ts` to use the interceptor: register custom commands (`init`, `inspect`, `clean`, `checkout`) in the registry; for passthrough commands, remove their commander registrations and let the interceptor handle them transparently.
- [ ] T005 [P] Refactor `src/cli/init.ts`: after creating `.bazel_git_lfs/`, run `mkdir .bazel_git_lfs/objects && git init .bazel_git_lfs/objects && git -C .bazel_git_lfs/objects lfs track "*"`. Ensure `.bazel_git_lfs/` is added to `.gitignore`.
- [ ] T006 [P] Refactor `src/cli/clean.ts`: remove the entire `.bazel_git_lfs/` directory (including the inner `objects/.git/` repo).
- [ ] T007 [P] Refactor `src/cli/checkout.ts` as a hybrid handler in the interceptor: `--`/`@` → custom URL replacement logic (existing); `<branch>` → execute `git -C .bazel_git_lfs/objects checkout <branch>` first, then run custom URL replacement/patch logic.
- [ ] T008 [P] Implement post-hook framework in `src/hooks/`: `PostHook` interface with `(exitCode, args) => void`. Registry mapping commands to post-hook functions.

**Checkpoint**: Foundation ready — interceptor, passthrough, and checkout hybrid work. User story implementation can begin.

---

## Phase 3: User Story 2 — Upstream Binding and Branch Suggestion (Priority: P2)

**Goal**: After `bazel-git-lfs remote add <name> <url>` (passthrough to `git -C .bazel_git_lfs/objects remote add`), run post-hook to suggest branch naming convention derived from URL.

**Independent Test**: Run `bazel-git-lfs remote add origin git@github.com:oxsource/bazel_git_lfs.git`, verify tool displays "Suggested branch format: oxsource_bazel-git-lfs_<feature>".

### Implementation for User Story 2

- [ ] T009 [P] [US2] Implement `src/hooks/parse-remote-url.ts`: extract group and repo from SSH (`git@host:group/repo`), HTTPS (`https://host/group/repo`), and Git (`git://host/group/repo`) URLs. Return `{group, repo}` or null for unrecognized formats (file://).
- [ ] T010 [P] [US2] Implement branch naming suggestion in `src/hooks/branch-suggestion.ts`: given `{group, repo}`, format as `<group>_<repo>_<feature>` with examples.
- [ ] T011 [P] [US2] Implement `src/hooks/post-remote-add.ts`: after `git -C .bazel_git_lfs/objects remote add` completes, parse the URL, display branch suggestion as informational message (no interactive prompt needed — git CLI is non-interactive-friendly).
- [ ] T012 [US2] Register post-remote-add hook in the interceptor registry in `src/cli/index.ts`.
- [ ] T013 [US2] Handle edge cases: non-standard URL formats (skip suggestion), duplicate remote names (let git handle conflict), and non-TTY environments (still output suggestion to stdout).

**Checkpoint**: Branch suggestion shown after every remote add. No interactive prompts — purely informational.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, backward compatibility, and cleanup.

- [ ] T014 Build and type-check: run `npm run build` and `npx tsc --noEmit` to verify no regressions.
- [ ] T015 [P] Verify backward compatibility: existing projects without inner `objects/.git` should auto-migrate on first `init` command.
- [ ] T016 [P] Verify `checkout --` and `checkout @` still work with the new hybrid interceptor.
- [ ] T017 [P] Verify passthrough commands (`fetch`, `push`, `pull`, `status`, `log`, `remote`, `branch`) work via `git -C .bazel_git_lfs/objects`.
- [ ] T018 [P] Verify integration test path: `init` → `remote add` → `fetch` → `push` → `pull` → `checkout --` → `clean`.
- [ ] T019 Update `docs/wiki/` to reflect the new interception/passthrough architecture if needed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS user story
- **US2 (Phase 3)**: Depends on Foundational — can start after
- **Polish (Phase 4)**: Depends on US2 complete

### Parallel Opportunities

- Foundational tasks T003–T008 can run in parallel (all different files)
- US2 tasks T009/T010/T011 can run in parallel (different files)
- Polish tasks T015/T016/T017/T018 can run in parallel

---

## Implementation Strategy

### MVP Deliverable (Phase 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (interception/passthrough)
3. **STOP and VALIDATE**: Git passthrough works for fetch/push/pull/status/log/branch
4. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Interception/passthrough ready (MVP!)
2. Add US2 (branch suggestion) → Full upstream workflow complete

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence