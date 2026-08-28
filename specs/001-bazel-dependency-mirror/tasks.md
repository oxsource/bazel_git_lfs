# Tasks: Bazel Dependency Mirror Tool

**Input**: Design documents from `/specs/001-bazel-dependency-mirror/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No explicit test tasks requested in the spec; each story defines an Independent Test to verify the story works on its own.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan (src/cli, src/discover, src/cache, src/verify, src/mirror, src/repo, src/rewrite, src/config, tests/)
- [ ] T002 Initialize npm package with package.json (name `bazel-git-lfs`, bin entry `bazel-git-lfs`, Node >= 18, TypeScript config tsconfig.json)
- [ ] T003 [P] Configure Commander CLI scaffold in src/cli/index.ts with subcommand registration placeholders (init/scan/sync/verify/list/search/rewrite) and `--json` global flag
- [ ] T004 [P] Configure linting and formatting tools (eslint, prettier) and add npm scripts (build, lint, test)
- [ ] T005 [P] Add Vitest test framework setup in tests/ with a trivial smoke test

**Checkpoint**: Project builds, CLI binary is invocable with `--help` listing all commands.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Create Dependency and Artifact types in src/discover/models.ts (fields per data-model.md: name, urls, sha256, stripPrefix, sourceFile, id, size, localPath, sourceUrls, mirrorPath)
- [ ] T007 Implement config management in src/config/config.ts (mirror repo URL, cache dir, git/git-lfs binary paths) with read/write/init support
- [ ] T008 Implement the ArtifactRepository interface in src/repo/repository.ts (exists(sha256), upload(artifact), download(artifact), verify(artifact)) per FR-012
- [ ] T009 Implement shared JSON output helper in src/cli/format.ts (human-readable + `--json` modes, errors to stderr, exit codes 0/1/2)
- [ ] T010 [P] Implement SHA256 helper in src/verify/sha256.ts (streaming hash of a file, comparison to declared value) per research decision 2

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Scan a Bazel project (Priority: P1) 🎯 MVP

**Goal**: Read-only discovery of Bazel remote HTTP dependencies (`http_archive`/`http_file` in WORKSPACE/WORKSPACE.bazel/MODULE.bazel)

**Independent Test**: Run `scan` against a fixture Bazel project with known `http_archive`/`http_file` entries; assert the exact expected set of dependencies (name, URL, SHA256) is reported and no files are modified.

### Implementation for User Story 1

- [ ] T011 [P] [US1] Implement Bazel parser in src/discover/bazel-parser.ts (extract name, urls, sha256, stripPrefix from http_archive/http_file, handle single url and urls list, multiline, comments)
- [ ] T012 [P] [US1] Implement project scanning (locate WORKSPACE, WORKSPACE.bazel, MODULE.bazel and collect dependencies) in src/discover/scanner.ts
- [ ] T013 [US1] Implement the `scan` command in src/cli/scan.ts (calls scanner, outputs inventory, exit 0 with empty list when no deps)
- [ ] T014 [US1] Add fixture Bazel projects under tests/fixtures/projects/ (WORKSPACE with http_archive, multi-URL http_archive, WORKSPACE.bazel, MODULE.bazel, empty project)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Mirror artifacts to Git LFS (Priority: P2)

**Goal**: `sync` downloads missing artifacts, verifies SHA256, caches, and mirrors to the shared Git LFS repository, updating the manifest and committing/pushing

**Independent Test**: Run `sync` against a fixture project; assert the mirror repo gains new artifacts, the manifest is updated, and a commit/push occurs. Re-run; assert no duplicate artifacts are uploaded.

### Implementation for User Story 2

- [ ] T015 [P] [US2] Implement manifest read/write in src/mirror/manifest.ts (artifact-id -> { source, sha256, path }, per data-model.md)
- [ ] T016 [P] [US2] Implement artifact downloader (fetch from source URL to local path, stream, timeout/error handling) in src/mirror/download.ts
- [ ] T017 [US2] Implement GitLfsRepository in src/mirror/git-lfs.ts implementing ArtifactRepository (clone, lfs install, lfs track, add, commit, push via child_process) per FR-015 and research decision 4
- [ ] T018 [US2] Implement sync orchestration in src/cli/sync.ts (discover -> check cache/manifest -> download -> verify -> upload -> manifest update -> commit/push; multi-project dedup via SHA256; `--no-push` flag)
- [ ] T019 [US2] Enforce SHA256 verification before any store/upload; reject and report `failed` on mismatch (G1, FR-005) in src/cli/sync.ts
- [ ] T020 [US2] Add mirror repo fixture + `.gitattributes` LFS tracking setup in tests/fixtures/mirror/ for integration runs

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Local cache (Priority: P3)

**Goal**: Content-addressed local cache keyed by SHA256 so repeated syncs avoid re-downloading

**Independent Test**: Run sync once to populate cache; run again and assert no re-download of cached artifacts occurs. Corrupt a cache entry and assert it is re-downloaded.

### Implementation for User Story 3

- [ ] T021 [P] [US3] Implement LocalCache in src/cache/local-cache.ts (store/read keyed by sha256, sidecar with source URLs, recompute hash on read to detect corruption)
- [ ] T022 [US3] Integrate LocalCache into sync in src/cli/sync.ts (read from cache before download; write to cache after verified download; invalidate on hash mismatch)

**Checkpoint**: At this point, User Stories 1, 2 AND 3 should all work independently

---

## Phase 6: User Story 4 - Verify mirror integrity (Priority: P3)

**Goal**: `verify` checks mirror artifacts against the manifest/SHA256 and reports corrupt artifacts

**Independent Test**: Tamper with an artifact in the mirror and run `verify`; assert the tool flags that artifact as corrupt. Clean mirror reports all valid.

### Implementation for User Story 4

- [ ] T023 [P] [US4] Implement verify logic in src/cli/verify.ts (iterate manifest, compare each artifact's content hash to recorded sha256, report valid/corrupt, non-zero exit if any corrupt)
- [ ] T024 [US4] Add `--all` flag handling and per-artifact status output in src/cli/verify.ts

**Checkpoint**: At this point, User Stories 1-4 should all work independently

---

## Phase 7: User Story 5 - Rewrite business project URLs (Priority: P2)

**Goal**: `rewrite` rewrites Bazel project URLs to internal mirror URLs, dry-run by default, only writing with `--apply`, and only for mirrored artifacts

**Independent Test**: Run `rewrite` in dry-run against a fixture project; assert proposed changes are printed and files unchanged. Run with `--apply`; assert files updated to mirror URLs only, nothing else changed.

### Implementation for User Story 5

- [ ] T025 [P] [US5] Implement URL rewrite logic in src/rewrite/rewrite.ts (map public url -> internal mirror url from manifest; skip artifacts not in mirror)
- [ ] T026 [US5] Implement the `rewrite` command in src/cli/rewrite.ts (dry-run default preview; `--apply` writes to disk; only targeted URL declarations modified)

**Checkpoint**: At this point, User Stories 1-5 should all work independently

---

## Phase 8: User Story 6 - Query the mirror inventory (Priority: P3)

**Goal**: `list` shows all mirrored artifacts; `search <keyword>` filters by name

**Independent Test**: After mirroring known artifacts, run `list` and `search abseil`; assert the correct artifacts are returned.

### Implementation for User Story 6

- [ ] T027 [P] [US6] Implement `list` command in src/cli/list.ts (read manifest, output all artifacts and metadata)
- [ ] T028 [P] [US6] Implement `search` command in src/cli/search.ts (filter manifest artifacts by keyword)

**Checkpoint**: At this point, all user stories should be independently functional

---

## Phase 9: User Story 7 - Install and publish as npm package (Priority: P2)

**Goal**: Package is installable from the public npm registry and exposes the `bazel-git-lfs` binary; release process is documented

**Independent Test**: Publish a version to npm (or local registry proxy), install in a fresh project, and assert the `bazel-git-lfs` binary is invocable and responds to `--help`.

### Implementation for User Story 7

- [ ] T029 [P] [US7] Verify package metadata in package.json (name, version, bin, files, engines, repository) for npm publishing
- [ ] T030 [US7] Add npm release documentation (version bump -> `npm publish`) to README.md at repository root per quickstart.md

**Checkpoint**: At this point, all user stories should be independently functional

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T031 [P] Add `.gitattributes` and README.md to the mirror repo template in tests/fixtures/mirror/
- [ ] T032 Error handling and user-friendly messages for edge cases (missing sha256, interrupted download, uninitialized mirror, missing git/git-lfs, unreachable remote) in src/cli/
- [ ] T033 Validate quickstart.md steps (install, init, scan, sync, verify, list, search, rewrite, publish) against the implemented CLI
- [ ] T034 Run lint, build, and typecheck across the project; fix any issues

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 -> P2 -> P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - depends on US1 discovery; independently testable
- **User Story 3 (P3)**: Depends on US2 sync (cache integrates into sync); independently testable once sync exists
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - uses manifest/repo; independently testable
- **User Story 5 (P2)**: Depends on US2 (rewrite uses manifest of mirrored artifacts); independently testable
- **User Story 6 (P3)**: Depends on US2 (list/search read manifest); independently testable
- **User Story 7 (P2)**: Depends on Setup (package metadata); independently testable

### Within Each User Story

- Models before services
- Services before commands
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- Models/parsers within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all parser/scanning tasks for User Story 1 together:
Task: "Implement Bazel parser in src/discover/bazel-parser.ts"
Task: "Implement project scanning in src/discover/scanner.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (scan)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 (scan) -> Test independently -> Demo (MVP!)
3. Add User Story 2 (sync) -> Test independently -> Demo
4. Add User Story 3 (cache), User Story 4 (verify), User Story 6 (query), User Story 5 (rewrite) -> Test independently
5. Add User Story 7 (npm publish) -> Release
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (scan) + User Story 5 (rewrite)
   - Developer B: User Story 2 (sync) + User Story 3 (cache)
   - Developer C: User Story 4 (verify) + User Story 6 (query)
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
