# Tasks: Foundation & Config (Stage 1)

**Input**: Design documents from `/specs/002-foundation-config/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No explicit test tasks requested in the spec; each user story defines an Independent Test to verify the story works on its own.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US1a, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure (TypeScript/Node.js CLI, per plan.md Technical Context)

- [x] T001 Create project structure per implementation plan (src/cli, src/config, tests/unit, tests/integration, tests/contract)
- [x] T002 Initialize npm package with package.json (name `bazel-git-lfs`, bin entry `bazel-git-lfs`, Node >= 18, TypeScript config tsconfig.json)
- [x] T003 [P] Configure linting and formatting tools (eslint, prettier) and add npm scripts (build, lint, test, typecheck)
- [x] T004 [P] Add Vitest test framework setup in tests/ with a trivial smoke test

**Checkpoint**: Project builds, CLI binary is invocable with `--help`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create Profile type in src/config/profile.ts per data-model.md (namespace, mirrorRepoUrl, gitLabHost, lfsEnabled, createdAt, updatedAt; namespace validation regex `[a-zA-Z0-9._-]`)
- [x] T006 Implement path resolution in src/config/paths.ts (config dir discovery: project-local `<cwd>/.bazel_git_lfs`, global `~/.bazel_git_lfs` honoring `BAZEL_GIT_LFS_HOME`, via os.homedir()) per research decision 1
- [x] T007 Implement scope discovery in src/config/scope.ts (project-local vs global scope resolution, default = project-local, `--global` opt-in) per research decision 1
- [x] T008 Implement fs-backed ProfileStore in src/config/store.ts behind an interface (atomic write via temp file + rename; read with parse/schema validation; corrupted file → clear error naming the config path) per research decisions 2, 3
- [x] T009 Implement URL format validation helper in src/config/profile.ts (must parse as HTTP(S) or SSH git URL; format only, no network) per research decision 9 (FR-014a)
- [x] T010 Implement shared output helpers in src/cli/format.ts (human-readable + `--json` modes, errors to stderr, exit codes 0/1/2 per contracts/cli.md Global section)
- [x] T011 Implement global alias table in src/config/alias.ts (add/list/remove; `remote.alias.<name> = <url>`; reject values starting with `@` for single-level resolution) per research decision 8 (FR-013b)
- [x] T012 Implement config resolution in src/config/resolve.ts (`resolveConfig({ scope?, namespace? })` → effective Profile: scope layering project-local > global → explicit `--namespace` → active default → error "No mirror configured. Run `bazel-git-lfs init` and `bazel-git-lfs remote add` first.") per research decision 5 (FR-008)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Initialize the config area (Priority: P1) 🎯 MVP

**Goal**: `init` creates a non-versioned `.bazel_git_lfs/` config directory (like `git init`), no prompts, excluded from version control (FR-001, FR-002)

**Independent Test**: Run `init` in a fresh project and assert a `.bazel_git_lfs/` directory is created, it is ignored by version control, and no other files are touched.

### Implementation for User Story 1

- [ ] T013 [US1] Implement the `init` command in src/cli/init.ts (creates `.bazel_git_lfs/`; safe re-run; adds `.bazel_git_lfs/` to `.gitignore` when a git repository is detected; output per contracts/cli.md)
- [ ] T014 [US1] Register `init` in src/cli/index.ts with Commander and implement `--json` output + `--help` (FR-011)
- [ ] T015 [US1] Register `scan`/`sync`/`verify`/`list`/`search`/`rewrite` as stub commands in src/cli/index.ts (print "not implemented in this stage" to stderr, exit 1) per contracts/cli.md stubs section

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Configure a mirror repository via `remote add` (Priority: P1)

**Goal**: `remote add` saves a namespace-tagged mirror profile in a selected scope (project-local default, `--global` opt-in), via interactive wizard or non-interactive flags (FR-004)

**Independent Test**: Run `remote add` (wizard and flag forms) and assert a namespace-tagged profile is saved in the selected scope with exactly the provided settings.

### Implementation for User Story 2

- [ ] T016 [US2] Implement `remote add` in src/cli/remote.ts (non-interactive flags `--global`, `--namespace`, `--mirror-repo`, `--gitlab-host`, `--lfs-enabled`; default namespace `default`; default scope project-local; missing required values in non-interactive mode → usage error exit 2)
- [ ] T017 [US2] Implement interactive wizard in src/cli/remote.ts using `prompts` when stdin is a TTY and required flags are absent (prompt mirror URL, GitLab host, LFS enabled; Ctrl-C interruption → exit non-zero, nothing written) per research decision 4
- [ ] T018 [US2] Integrate ProfileStore writes into `remote add` (save namespace-tagged profile; update-in-place on same namespace; first profile in a scope becomes active default; JSON output per contracts/cli.md)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 2a - Reference a mirror URL by global alias (Priority: P1)

**Goal**: `remote add --mirror-repo @<name>` resolves through the global alias table and stores the resolved URL (FR-013, FR-013a)

**Independent Test**: Define a global alias `remote.alias.company-mirror = <url>`, run `remote add --mirror-repo @company-mirror`, and assert the saved profile stores the resolved URL (not the `@` token).

### Implementation for User Story 2a

- [ ] T019 [P] [US2a] Implement `remote alias add` / `list` / `remove` in src/cli/remote.ts (alias add rejects values starting with `@`; stored in global config only per research decision 8)
- [ ] T020 [US2a] Implement `@` alias resolution in `remote add` (URL starting with `@` → resolve via global alias table; unknown alias → error exit 1 naming the alias; non-`@` URLs used verbatim) per FR-013a

**Checkpoint**: At this point, User Stories 1, 2 AND 2a should all work independently

---

## Phase 6: User Story 3 - Project-local mirror config overrides the global default (Priority: P1)

**Goal**: Project-local profile overrides global for commands run inside the project (FR-005, FR-005a, SC-006)

**Independent Test**: Configure a global profile (mirror A) and a project-local profile (mirror B); run a config-resolving command inside the project and assert mirror B is used; run outside and assert mirror A.

### Implementation for User Story 3

- [ ] T021 [US3] Implement scope-aware writes in `remote add` (write to selected scope only; project-local operations never modify the global config) per SC-006
- [ ] T022 [US3] Wire `resolveConfig` scope layering into `remote list` (show per-scope profiles, both scopes labeled when no scope given) per contracts/cli.md

**Checkpoint**: At this point, User Stories 1, 2, 2a AND 3 should all work independently

---

## Phase 7: User Story 4 - Manage multiple mirror profiles by namespace (Priority: P2)

**Goal**: `remote list`/`remove`/`set-default` manage multiple namespace-tagged profiles with active-default per scope and `--namespace` override (FR-006, FR-007)

**Independent Test**: Create two profiles with different namespaces, set one active, run a command with `--namespace` pointing to the other, and assert the correct profile is used in each case.

### Implementation for User Story 4

- [ ] T023 [US4] Implement `remote set-default <namespace> [--global]` in src/cli/remote.ts (designates active default per scope; error listing known namespaces if namespace missing)
- [ ] T024 [US4] Implement `remote remove <namespace> [--global]` in src/cli/remote.ts (removes profile; active marker falls back to another profile or null)
- [ ] T025 [US4] Implement `--namespace` override in `resolveConfig` resolution path (explicit `--namespace` → active default) per FR-007

**Checkpoint**: At this point, User Stories 1-4 should all work independently

---

## Phase 8: User Story 5 - Let other commands read the resolved configuration (Priority: P2)

**Goal**: `remote list --effective` shows the merged, actually-in-effect profile (FR-014); internal `resolveConfig` is the deterministic resolution path for downstream commands (FR-008, FR-009)

**Independent Test**: After configuring a profile, invoke `remote list --effective` and assert it returns exactly the saved settings for the effective profile (project-local first, then global).

### Implementation for User Story 5

- [ ] T026 [US5] Implement `remote list --effective` in src/cli/remote.ts (merged effective profile: scope layering → namespace/active selection; annotate source scope of each resolved value) per research decision 10 (FR-014)
- [ ] T027 [US5] Implement no-profile error path in `resolveConfig` (exit 1 with "No mirror configured. Run `bazel-git-lfs init` and `bazel-git-lfs remote add` first.") per FR-009

**Checkpoint**: At this point, all user stories should be independently functional

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T028 [P] Implement corrupted/unreadable config file error handling (clear error naming config path, suggest re-running `init`) in src/config/store.ts per contracts/cli.md error conventions
- [ ] T029 [P] Implement unwritable config directory error handling (home dir not writable / project dir not writable for `--local`) in src/cli/
- [ ] T030 Validate quickstart.md steps (init, remote add wizard/flags, alias, list --effective, set-default, remove) against the implemented CLI
- [ ] T031 Run lint, build, and typecheck across the project; fix any issues
- [ ] T032 Verify `bazel-git-lfs --help` lists all commands (init, remote, scan, sync, verify, list, search, rewrite) and exit codes follow the contract

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

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - depends on ProfileStore (T008) and paths/scope; independently testable
- **User Story 2a (P1)**: Depends on US2 (`remote add`) and the alias table (T011, T019); independently testable once `remote add` exists
- **User Story 3 (P1)**: Depends on US2 (scope-aware writes) and resolveConfig (T012); independently testable
- **User Story 4 (P2)**: Depends on US2/US3 (profiles exist per scope); independently testable
- **User Story 5 (P2)**: Depends on resolveConfig (T012) and US3/US4 (scope + namespace resolution); independently testable

### Within Each User Story

- Models before services
- Services before commands
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- T013 (init) and T016/T017 (remote add) can be developed in parallel after Foundational
- T019 (alias subcommands) is parallel with T016/T017

---

## Parallel Example: User Story 1 + 2

```bash
# Launch foundational + first stories together:
Task: "Implement init command in src/cli/init.ts"
Task: "Implement remote add flags path in src/cli/remote.ts"
Task: "Implement remote alias subcommands in src/cli/remote.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (init)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 (init) -> Test independently -> Demo
3. Add User Story 2 (remote add) + 2a (aliases) -> Test independently -> Demo
4. Add User Story 3 (scope override) -> Test independently -> Demo
5. Add User Story 4 (multi-profile), User Story 5 (effective resolution) -> Test independently
6. Add Polish (Phase 9) -> Release

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (init) + User Story 3 (scope)
   - Developer B: User Story 2 (remote add) + User Story 2a (aliases)
   - Developer C: User Story 4 (multi-profile) + User Story 5 (effective)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify each story's Independent Test passes before moving on
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
