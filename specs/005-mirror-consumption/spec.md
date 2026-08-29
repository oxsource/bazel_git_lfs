# Feature Specification: Stage 4 — Mirror Consumption (verify / list / search)

**Feature Branch**: `005-mirror-consumption`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Stage 4: Mirror Consumption (S4) — verify, list, search, query and audit the mirror"

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this stage implements [Stage 4 (Mirror Consumption)](../001-bazel-git-lfs-guide/plan.md), covering FR-010 and FR-011 of the parent spec. The mirror manifest, objects store, and Maven-style layout are inherited from Stage 3 (004-fetch-pull-push).

## Clarifications

*No clarifications needed — Stage 4 requirements are well-defined in the parent guide and the existing Stage 3 data model.*

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Verify mirrored artifacts against recorded SHA256 (Priority: P1)

A mirror maintainer runs `bazel-git-lfs verify` to check that every artifact in the mirror is intact and matches its recorded SHA256. The tool reads the mirror manifest and re-computes the SHA256 of each stored object, comparing it against the manifest entry. Artifacts whose content no longer matches (corrupted in storage, tampered, or partial) are reported as failed with the expected and actual hashes. Artifacts that pass are reported as valid. The local objects store is also verified against the local manifest (the mirror manifest is the authoritative source).

**Why this priority**: Integrity of the mirror is the core value proposition. Without verify, users cannot trust that cached artifacts match their originals. A corruption-notification capability is the minimum safety net for a shared mirror.

**Independent Test**: Tamper with an artifact in the mirror (replace bytes in the LFS object store) and run `verify`; assert the tool flags that artifact as corrupt with the expected and actual SHA256. Re-run after all artifacts are intact; assert all pass.

**Acceptance Scenarios**:

1. **Given** a mirror where all artifacts match their SHA256, **When** `verify` runs, **Then** the tool reports all artifacts as `valid` and exits successfully.
2. **Given** a mirror where one artifact's content has been modified, **When** `verify` runs, **Then** the tool identifies that artifact as `corrupt` with the expected and actual SHA256, reports it as failed, and exits non-zero.
3. **Given** a mirror with an artifact that is missing its LFS object (pointer in git but no object in LFS storage), **When** `verify` runs, **Then** the tool reports it as `missing` with a clear message.
4. **Given** a local objects store entry whose SHA256 does not match the mirror manifest, **When** `verify` runs, **Then** the inconsistency is reported as a warning (the mirror manifest is authoritative).
5. **Given** a mirror with no artifacts, **When** `verify` runs, **Then** the tool reports an empty result and exits successfully.

---

### User Story 2 — List all mirrored artifacts (Priority: P2)

A user runs `bazel-git-lfs list` to view all artifacts currently in the mirror. The output includes each artifact's SHA256, mirror path, source URLs, and the date it was first mirrored. The output is JSON (consistent with the rest of the CLI). The user can optionally filter by SHA256 prefix or source URL.

**Why this priority**: Listing the mirror inventory gives users visibility into what is available, enabling them to understand mirror coverage without inspecting the raw manifest.

**Independent Test**: After mirroring known artifacts, run `list` and assert all artifacts are returned with their correct metadata. Run `list --sha256-prefix ab12` and assert only matching artifacts are returned.

**Acceptance Scenarios**:

1. **Given** a mirror with several artifacts, **When** the user runs `list`, **Then** all artifacts and their metadata (SHA256, path, source URLs, first-seen date) are returned as JSON.
2. **Given** a mirror with an artifact whose SHA256 starts with `ab12`, **When** the user runs `list --sha256-prefix ab12`, **Then** only matching artifacts are returned.
3. **Given** a mirror with an artifact whose source URL matches `github.com`, **When** the user runs `list --source-url github.com`, **Then** only matching artifacts are returned.
4. **Given** the `list` command is invoked with extra arguments, **When** the command runs, **Then** it exits with a usage error (exit 2, consistent with other commands).
5. **Given** an empty mirror with no artifacts, **When** `list` runs, **Then** an empty result is returned successfully.

---

### User Story 3 — Search mirrored artifacts by keyword (Priority: P2)

A user runs `bazel-git-lfs search <keyword>` to find artifacts in the mirror whose name, path, or source URL contains the keyword. Results are returned as JSON. The search is case-insensitive and matches substrings. This is a thin convenience layer over the manifest, not a full-text search engine.

**Why this priority**: Search helps users quickly locate artifacts when the mirror grows beyond a handful of entries, without needing to pipe `list` through grep.

**Independent Test**: After mirroring artifacts with known names and URLs, run `search abseil` and `search GITHUB` and assert the correct subsets are returned.

**Acceptance Scenarios**:

1. **Given** a mirror with an artifact whose name contains `abseil`, **When** the user runs `search abseil`, **Then** the matching artifact is returned as JSON.
2. **Given** a mirror with an artifact whose source URL contains `github.com`, **When** the user runs `search github`, **Then** the matching artifact is returned (case-insensitive substring match).
3. **Given** a keyword that matches no artifact, **When** the user runs `search <keyword>`, **Then** an empty result is returned successfully.
4. **Given** `search` is invoked without a keyword argument, **When** the command runs, **Then** it exits with a usage error (exit 2).
5. **Given** multiple artifacts match the keyword, **When** `search` runs, **Then** all matching artifacts are returned.

---

### User Story 4 — Reset tool state for testing and recovery (Priority: P2)

A user runs `bazel-git-lfs clean` to reset the tool's local state without losing the remote profile configuration. The command removes the local objects store (`.bazel_git_lfs/objects/`), the LFS working clone (`.bazel_git_lfs/mirror/`), and the dependency snapshot (`.bazel_git_lfs/dependencies.json`). The profile configuration (`.bazel_git_lfs/config.json`) and the `.gitignore` entry are preserved. This allows re-running `inspect` → `fetch` → `push` → `pull` from scratch without re-configuring the remote.

**Why this priority**: `clean` is essential for iterative testing and recovery from corrupted local state. It enables users to quickly reset the tool without losing their mirror configuration, and is a safety net during development.

**Independent Test**: Run `init` → `inspect` → `fetch` → `clean`; assert the objects store, mirror working clone, and snapshot are removed, but the config file and `.gitignore` entry remain intact. Re-run `inspect` successfully (snapshot is recreated).

**Acceptance Scenarios**:

1. **Given** an initialized project with objects, mirror working clone, and snapshot, **When** `clean` runs, **Then** the objects store, mirror working clone, and snapshot are removed, the config file and `.gitignore` entry are preserved, and the JSON result lists the removed items.
2. **Given** an initialized project with no objects or snapshot, **When** `clean` runs, **Then** it reports an empty result successfully (idempotent).
3. **Given** a project that has not been initialized, **When** `clean` runs, **Then** it reports the standard "Not a valid bazel_git_lfs project" error and exits non-zero.
4. **Given** a project with a corrupt config file, **When** `clean` runs, **Then** it reports the standard config error and exits non-zero (config must be valid to locate the state directories).
5. **Given** `clean` is invoked with extra arguments, **When** the command runs, **Then** it exits with a usage error (exit 2).

---

### Edge Cases

- What happens when the mirror manifest is not available (mirror not cloned yet, or network unavailable)? (`verify` and `list`/`search` report a clear error: the mirror must be accessible; `verify` works locally if the working clone is cached, otherwise requires the mirror)
- What happens when the mirror has objects but no manifest? (reported as a fatal error — never assume an empty inventory; same guard as Stage 3 push/pull)
- What happens when the user runs `verify` on a project that has not been initialized? (same error as other commands: "Not a valid bazel_git_lfs project")
- What happens when the mirror manifest is corrupted? (parse error reported; verify aborts)
- What happens when `list` is run on a project with no snapshot? (error: run `inspect` first)
- What happens when `clean` is run on a project that is already clean? (successful no-op, empty removal list)
- How does `verify` handle very large artifacts? (streaming SHA256, same as fetch; memory-bounded)
- What happens when the LFS object store behind the mirror is temporarily unavailable for `verify`? (verify reports the object as `missing` with a network/unreachable reason)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `verify` command that reads the mirror manifest and re-computes the SHA256 of each mirrored object, comparing it against the recorded value. Results are reported per artifact as `valid`, `corrupt`, or `missing`.
- **FR-002**: `verify` MUST report the expected and actual SHA256 for corrupt artifacts, and MUST include the mirror path for traceability.
- **FR-003**: `verify` MUST cover both the remote mirror (via the working clone manifest) and, when the local objects store is present, cross-check local entries against the manifest. The mirror manifest is authoritative.
- **FR-004**: `verify` MUST exit non-zero when any artifact is corrupt or missing, and exit zero when all artifacts are valid or the mirror is empty.
- **FR-005**: System MUST provide a `list` command that reads the mirror manifest and outputs all artifacts as structured JSON, including SHA256, mirror path, source URLs, and first-seen date.
- **FR-006**: `list` MUST support optional filters: `--sha256-prefix <hex>` to filter by SHA256 prefix, and `--source-url <substring>` to filter by source URL substring. Filtering is case-insensitive.
- **FR-007**: System MUST provide a `search <keyword>` command that performs a case-insensitive substring match across artifact names (derived from the source URL path), mirror paths, and source URLs. Results are returned as JSON.
- **FR-008**: `search` MUST exit with a usage error (exit 2) when invoked without a keyword argument. Extra arguments are also a usage error.
- **FR-009**: `verify`, `list`, and `search` MUST output valid structured JSON to stdout only (no human mode, no `--json` flag, consistent with the rest of the CLI).
- **FR-010**: `verify`, `list`, and `search` MUST require an initialized config area (`init`) and a persisted dependency snapshot (`inspect`). Errors are JSON `{ ok: false, error }` with non-zero exit.
- **FR-011**: `verify`, `list`, and `search` MUST operate on the current project only (no project-directory arguments; extra arguments are a usage error, exit 2).
- **FR-012**: `verify` MUST use the same streaming SHA256 computation as Stage 3's `fetch` (memory-bounded, no full buffering).
- **FR-013**: `verify` MUST report a clear error when the mirror manifest is missing or corrupt and the mirror contains objects (same guard as Stage 3 push/pull — never rebuild inventory silently).
- **FR-014**: System MUST provide a `clean` command that removes the local objects store (`.bazel_git_lfs/objects/`), the LFS working clone (`.bazel_git_lfs/mirror/`), and the dependency snapshot (`.bazel_git_lfs/dependencies.json`), while preserving the profile configuration (`.bazel_git_lfs/config.json`).
- **FR-015**: `clean` MUST output valid structured JSON to stdout listing the removed items.
- **FR-016**: `clean` MUST require an initialized config area (`init`). Errors are JSON `{ ok: false, error }` with non-zero exit.
- **FR-017**: `clean` MUST operate on the current project only (no project-directory arguments; extra arguments are a usage error, exit 2).
- **FR-018**: `clean` MUST be idempotent: running it on a project that is already clean is a successful no-op (exit 0, empty removal list).

### Key Entities

- **Mirror Manifest**: The authoritative inventory of mirrored artifacts, as defined in Stage 3. Keyed by SHA256, each entry records the mirror path, source URLs, and first-seen timestamp.
- **Verify Result**: Per-artifact outcome (`valid`, `corrupt`, `missing`) with optional expected/actual SHA256 for corrupt entries and an error message for missing ones.
- **List Result**: The full set of manifest entries, optionally filtered by SHA256 prefix or source URL substring.
- **Search Result**: The subset of manifest entries matching a keyword substring across name, path, or source URL.
- **Clean Result**: JSON listing of removed items (objects store, mirror working clone, snapshot) with their paths.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `verify` against an intact mirror reports 100% of artifacts as `valid` and exits zero.
- **SC-002**: `verify` against a mirror with a single corrupted artifact identifies exactly that artifact as `corrupt` with the correct expected and actual SHA256, and exits non-zero.
- **SC-003**: `verify` against a mirror with a missing LFS object identifies that artifact as `missing` and exits non-zero.
- **SC-004**: `list` returns all artifacts in the manifest when no filters are applied; `list --sha256-prefix` and `--source-url` correctly return filtered subsets.
- **SC-005**: `search` with a matching keyword returns the correct subset of artifacts; `search` with a non-matching keyword returns an empty result successfully.
- **SC-006**: All three commands are JSON-only, machine-consumable, and report errors as `{ ok: false, error }` with non-zero exit.
- **SC-007**: An empty mirror (no artifacts) reports empty results successfully for all three commands.
- **SC-008**: `clean` removes the objects store, mirror working clone, and snapshot while preserving the config file; a second `clean` is a successful no-op.

## Assumptions

- `verify` reads the manifest from the LFS working clone (same as Stage 3 push/pull); the working clone is maintained by the existing `ArtifactRepository` abstraction.
- `list` and `search` read the manifest from the LFS working clone; they do not require the working clone to be fully materialized (git LFS objects need not be pulled; only the manifest.json is needed).
- Manifest parsing and validation reuse the Stage 3 `manifest.ts` module unchanged.
- The existing `--sha256-prefix` and `--source-url` filter flags are optional; without them, all artifacts are returned.
- `verify` does not modify the manifest or any objects; it is read-only with respect to the mirror.
- The `verify` command does not require a configured remote profile (it reads the manifest from the already-cloned mirror working clone); however, it does require that `inspect` has been run (for the dependency snapshot, though verify may not strictly need it — the mirror manifest is the data source). *Decision: verify requires neither a snapshot nor a profile; it reads the manifest directly from the local mirror working clone.*
- `list` and `search` similarly require neither a snapshot nor a profile; they read the manifest directly.
- All three commands require only an initialized config area (to locate the mirror working clone under `.bazel_git_lfs/mirror/`).
- `clean` preserves the config file and the `.gitignore` entry; it removes only the generated state (objects, mirror working clone, snapshot).